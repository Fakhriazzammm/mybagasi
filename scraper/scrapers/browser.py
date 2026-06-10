"""Browser-based scraper using Playwright for JS-rendered pages.

Used as fallback when HTTP-based scrapers fail (anti-bot, CAPTCHA, JS-heavy).
Singleton browser instance for efficiency, separate context per page.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

log = logging.getLogger("mybagasi_browser")

_browser = None
_playwright = None


async def get_browser():
    """Get or create the singleton Playwright browser instance."""
    global _browser, _playwright
    if _browser is None:
        from playwright.async_api import async_playwright
        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
            ],
        )
    return _browser


async def close_browser():
    """Clean up the browser instance (call on shutdown)."""
    global _browser, _playwright
    if _browser:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    if _playwright:
        try:
            await _playwright.stop()
        except Exception:
            pass
        _playwright = None


async def scrape_with_browser(url: str, timeout: int = 20) -> dict[str, Any] | None:
    """
    Open a URL in a headless browser, extract product data.

    Returns a dict with keys:
        title, description, image, price, price_jpy, marketplace, available, error
    Returns None only on catastrophic failure (no browser).
    """
    browser = await get_browser()
    context = None
    page = None
    try:
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 720},
            locale="ja-JP",
        )
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
        await asyncio.sleep(2)  # Let JS render

        # Extract data via page.evaluate
        data = await page.evaluate("""() => {
            const metaDesc = document.querySelector('meta[name="description"]');
            const ogImage = document.querySelector('meta[property="og:image"]');
            const ogTitle = document.querySelector('meta[property="og:title"]');
            const ogPrice = document.querySelector('meta[property="product:price:amount"]');
            const ogUrl = document.querySelector('meta[property="og:url"]');

            return {
                title: ogTitle?.content || document.title || '',
                description: metaDesc?.content || '',
                image: ogImage?.content || '',
                price: ogPrice?.content || '',
                ogUrl: ogUrl?.content || '',
            };
        }""")

        # Also try to find price from common selectors if og:price not set
        if not data.get("price"):
            try:
                price_from_page = await page.evaluate("""() => {
                    const selectors = [
                        '[data-testid="price"]',
                        '.price',
                        '.product-price',
                        '[class*="price"]',
                        'span:has(> span:contains("¥"))',
                    ];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent) return el.textContent.trim();
                    }
                    return '';
                }""")
                data["price"] = price_from_page or ""
            except Exception:
                pass

        return {
            "title": (data.get("title") or "").strip(),
            "description": (data.get("description") or "").strip(),
            "image": (data.get("image") or "").strip(),
            "price": (data.get("price") or "").strip(),
            "price_jpy": _parse_price(data.get("price", "")),
            "marketplace": _detect_marketplace(url),
            "available": True,
            "error": None,
        }
    except Exception as e:
        log.warning(f"Browser scrape failed for {url[:60]}: {e}")
        return {
            "title": "",
            "description": "",
            "image": "",
            "price": "",
            "price_jpy": None,
            "marketplace": _detect_marketplace(url),
            "available": False,
            "error": str(e),
        }
    finally:
        if page:
            try:
                await page.close()
            except Exception:
                pass
        if context:
            try:
                await context.close()
            except Exception:
                pass


def _parse_price(price_str: str) -> int | None:
    if not price_str:
        return None
    digits = re.sub(r"[^0-9]", "", price_str)
    return int(digits) if digits else None


def _detect_marketplace(url: str) -> str:
    from urllib.parse import urlparse
    host = urlparse(url).hostname or ""
    if "mercari" in host:
        return "Mercari"
    if "amazon" in host:
        return "Amazon JP"
    if "rakuten" in host:
        return "Rakuten"
    if "yahoo" in host:
        return "Yahoo Auction"
    return "Japan Marketplace"
