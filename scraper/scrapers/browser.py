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

        await asyncio.sleep(1)  # Extra wait for JS-rendered content
        await page.wait_for_load_state("networkidle", timeout=timeout * 1000)

        # Extract data via page.evaluate — comprehensive extraction for ANY page type
        data = await page.evaluate("""() => {
            const metaDesc = document.querySelector('meta[name="description"]');
            const ogImage = document.querySelector('meta[property="og:image"]');
            const ogTitle = document.querySelector('meta[property="og:title"]');
            const ogPrice = document.querySelector('meta[property="product:price:amount"]');

            // ── Visible content extraction ──
            // Get main heading (h1) — best candidate for product/catalog title
            let h1Text = '';
            const h1El = document.querySelector('h1');
            if (h1El) h1Text = h1El.textContent.trim();

            // Collect all h2/h3 for description context
            const headings = [];
            document.querySelectorAll('h2, h3').forEach(el => {
                const t = el.textContent.trim();
                if (t && t.length > 5) headings.push(t);
            });

            // ── Price extraction from visible text ──
            // Find ANY price pattern in the page: ¥1,234, 1,234円, etc.
            const bodyText = document.body ? document.body.innerText : '';
            const pricePatterns = [
                /[¥￥]\\s*\\d{1,3}(?:,\\d{3})+/g,
                /\\d{1,3}(?:,\\d{3})+\\s*[円]/g,
                /\\d{1,3}(?:,\\d{3})+\\s*YEN/gi,
                /Price[\\s:]*[¥￥]?\\s*\\d{1,3}(?:,\\d{3})+/gi,
                /現在[：:]?\\s*[¥￥]?\\s*\\d{1,3}(?:,\\d{3})+/g,
                /即決[：:]?\\s*[¥￥]?\\s*\\d{1,3}(?:,\\d{3})+/g,
                /出品価格[：:]?\\s*[¥￥]?\\s*\\d{1,3}(?:,\\d{3})+/g,
            ];
            let foundPrice = '';
            for (const pat of pricePatterns) {
                const m = bodyText.match(pat);
                if (m) { foundPrice = m[0]; break; }
            }

            // ── Image extraction ──
            const images = [];
            const seenUrls = new Set();
            // og:image first
            if (ogImage?.content && !seenUrls.has(ogImage.content)) {
                images.push(ogImage.content);
                seenUrls.add(ogImage.content);
            }
            // Product images from common selectors
            document.querySelectorAll(
                'img[src*="product"], img[src*="item"], img[src*="goods"], ' +
                'img[class*="Product"], img[class*="product"], img[class*="Item"], img[class*="item"], ' +
                'img[class*="Thumbnail"], img[class*="thumbnail"], ' +
                'li[class*="image"] img, [class*="gallery"] img, [class*="slide"] img'
            ).forEach(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                if (src && src.startsWith('http') && !seenUrls.has(src)) {
                    images.push(src);
                    seenUrls.add(src);
                }
            });
            // Fallback: any large image (width > 100)
            if (images.length < 3) {
                document.querySelectorAll('img[src]').forEach(img => {
                    const src = img.src || '';
                    if (src.startsWith('http') && !seenUrls.has(src) &&
                        img.width > 100 && img.naturalWidth > 100 &&
                        !src.includes('logo') && !src.includes('banner') && !src.includes('icon') &&
                        !src.includes('avatar') && !src.includes('favicon')) {
                        images.push(src);
                        seenUrls.add(src);
                    }
                });
            }

            // ── Description — take meta desc or first meaningful paragraph ──
            let description = metaDesc?.content || '';
            if (!description || description.length < 20) {
                const paragraphs = document.querySelectorAll('p');
                for (const p of paragraphs) {
                    const t = p.textContent.trim();
                    if (t.length > 30) { description = t; break; }
                }
            }

            // ── Available check ──
            const isAvailable = !bodyText.toLowerCase().includes('sold out') &&
                                !bodyText.toLowerCase().includes('page not found') &&
                                !bodyText.toLowerCase().includes('404');

            return {
                title: ogTitle?.content || h1Text || document.title || '',
                description: description || headings.slice(0, 3).join(' · ') || '',
                image: images[0] || '',
                images: images.slice(0, 6),
                price: foundPrice || '',
                priceFromText: foundPrice || '',
                bodyTextPreview: bodyText.slice(0, 2000).trim(),
                isAvailable: isAvailable,
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
                        '.Pricing__Price',
                        '.Price__value',
                        '[class*="Price"]',
                    ];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent) return el.textContent.trim();
                    }
                    return '';
                }""")
                data["price"] = price_from_page or data.get("priceFromText") or ""
            except Exception:
                pass
        
        # If still no price, use whatever we found in body text
        if not data.get("price") and data.get("priceFromText"):
            data["price"] = data["priceFromText"]

        images = data.get("images") or []
        if not images and data.get("image"):
            images = [data["image"]]

        return {
            "title": (data.get("title") or "").strip(),
            "description": (data.get("description") or "").strip(),
            "image": images[0] if images else "",
            "images": images,
            "price": (data.get("price") or "").strip(),
            "price_jpy": _parse_price(data.get("price", "")),
            "marketplace": _detect_marketplace(url),
            "available": data.get("isAvailable", True) if isinstance(data.get("isAvailable"), bool) else True,
            "error": None,
            "body_text": (data.get("bodyTextPreview") or "")[:500],
        }
    except Exception as e:
        log.warning(f"Browser scrape failed for {url[:60]}: {e}")
        return {
            "title": "",
            "description": "",
            "image": "",
            "images": [],
            "price": "",
            "price_jpy": None,
            "marketplace": _detect_marketplace(url),
            "available": False,
            "error": str(e),
            "body_text": "",
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
