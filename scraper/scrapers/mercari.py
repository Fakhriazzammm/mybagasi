"""
Mercari JP scraper.

Primary path: Playwright + __NEXT_DATA__ extraction.
Fallback path: Crawl4AI markdown extraction.
"""
from __future__ import annotations

import json
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from .generic import _crawl4ai
from .models import BROWSER_HEADERS, ProductData, parse_jpy


async def scrape_mercari(url: str) -> ProductData:
    normalized_url = _normalize_mercari_url(url)
    if "/item/" not in normalized_url:
        raise ValueError("URL_INVALID: format link Mercari tidak valid")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
            extra_http_headers={"Accept-Language": "ja-JP,ja;q=0.9"},
        )
        page = await context.new_page()
        try:
            await _apply_stealth(page)
            await page.goto(normalized_url, wait_until="domcontentloaded", timeout=45_000)
            await page.wait_for_timeout(1200)

            # --- Try embedded Next.js JSON first (fastest path) ---
            next_raw: Optional[str] = await page.evaluate(
                "() => document.getElementById('__NEXT_DATA__')?.textContent"
            )
            if next_raw:
                product = _parse_next_data(next_raw, normalized_url)
                if product:
                    product.confidence = "high"
                    product.scrape_reason_code = "PLAYWRIGHT"
                    return product

            # --- Fallback: live DOM selectors ---
            title = (await page.locator("h1").first.text_content(timeout=8_000)) or ""

            price_locator = page.locator(
                '[data-testid="price"], [class*="price"], [class*="Price"]'
            ).first
            price_text = ""
            try:
                price_text = (await price_locator.text_content(timeout=4_000)) or ""
            except Exception:
                pass

            images: list[str] = await page.evaluate(
                """() => [...document.querySelectorAll('img')]
                    .map(i => i.src)
                    .filter(s => s.includes('static.mercdn') || s.includes('mercari'))
                    .slice(0, 6)"""
            )

            desc_locator = page.locator(
                '[data-testid="item-detail-description"], [class*="Description"]'
            ).first
            description = ""
            try:
                description = (await desc_locator.text_content(timeout=3_000)) or ""
            except Exception:
                pass

            if title.strip() or price_text.strip() or images:
                return ProductData(
                    title=title.strip(),
                    price_jpy=parse_jpy(price_text),
                    price_display=price_text.strip(),
                    images=images,
                    description=description.strip()[:600],
                    marketplace="mercari",
                    url=normalized_url,
                    confidence="medium" if title.strip() and images else "low",
                    scrape_reason_code="PLAYWRIGHT",
                )

            # Last resort for bot-protected pages.
            return await _crawl4ai_fallback(normalized_url)
        finally:
            await browser.close()


async def _crawl4ai_fallback(url: str) -> ProductData:
    try:
        product = await _crawl4ai(url)
        product.marketplace = "mercari"
        product.url = url
        product.confidence = "medium" if product.price_jpy and product.images else "low"
        product.scrape_reason_code = "CRAWL4AI"
        return product
    except Exception:
        return await _http_fallback(url)


def _normalize_mercari_url(url: str) -> str:
    normalized = url.strip()

    # Handle old/wrong route format often pasted by users.
    normalized = re.sub(r"mercari\.com/items/", "jp.mercari.com/item/", normalized)
    normalized = re.sub(r"www\.mercari\.com/item/", "jp.mercari.com/item/", normalized)
    if "mercari.com/item/" in normalized and "jp.mercari.com/item/" not in normalized:
        normalized = normalized.replace("mercari.com/item/", "jp.mercari.com/item/")

    return normalized


async def _http_fallback(url: str) -> ProductData:
    async with httpx.AsyncClient(
        headers=BROWSER_HEADERS, follow_redirects=True, timeout=20
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    title = (
        (soup.select_one("meta[property='og:title']") or {}).get("content", "")
        or (soup.find("title").get_text(strip=True) if soup.find("title") else "")
        or "Mercari Product"
    )
    image = (soup.select_one("meta[property='og:image']") or {}).get("content", "")
    desc = (soup.select_one("meta[property='og:description']") or {}).get("content", "")
    price_text = ""
    for text in soup.stripped_strings:
        if "¥" in text or "$" in text:
            price_text = text
            break

    return ProductData(
        title=title[:200],
        price_jpy=parse_jpy(price_text),
        price_display=price_text[:40],
        images=[image] if image else [],
        description=desc[:600] or None,
        marketplace="mercari",
        url=url,
        confidence="low",
        scrape_reason_code="PARSE_EMPTY",
    )


async def _apply_stealth(page) -> None:
    try:
        from playwright_stealth import stealth_async  # type: ignore

        await stealth_async(page)
    except Exception:
        # Optional dependency: continue without stealth if unavailable.
        return


def _parse_next_data(raw: str, url: str) -> Optional[ProductData]:
    try:
        data = json.loads(raw)
        props = data.get("props", {}).get("pageProps", {})
        item: Optional[dict] = (
            props.get("item")
            or props.get("itemDetail", {}).get("item")
        )
        if not item:
            return None

        price = item.get("price", 0)
        photos = item.get("photos") or item.get("thumbnails") or []
        images = [p.get("imageUrl") or p.get("url", "") for p in photos if isinstance(p, dict)]

        return ProductData(
            title=item.get("name", "").strip(),
            price_jpy=int(price) if price else None,
            price_display=f"¥{int(price):,}" if price else "",
            condition=_cond(item),
            images=[img for img in images if img][:6],
            description=(item.get("description") or "").strip()[:600],
            seller=(item.get("seller") or {}).get("name"),
            marketplace="mercari",
            available=item.get("status") == "on_sale",
            url=url,
        )
    except Exception:
        return None


def _cond(item: dict) -> Optional[str]:
    cond = item.get("itemCondition") or item.get("condition") or {}
    return cond.get("name") if isinstance(cond, dict) else str(cond) if cond else None
