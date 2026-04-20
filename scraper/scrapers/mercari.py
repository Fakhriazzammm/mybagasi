"""
Mercari JP scraper.

Mercari uses Next.js — product data is embedded in <script id="__NEXT_DATA__">.
We try to parse that first; Playwright is used as a fallback for dynamic content.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from playwright.async_api import async_playwright

from .models import ProductData, parse_jpy


async def scrape_mercari(url: str) -> ProductData:
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
            await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

            # --- Try embedded Next.js JSON first (fastest path) ---
            next_raw: Optional[str] = await page.evaluate(
                "() => document.getElementById('__NEXT_DATA__')?.textContent"
            )
            if next_raw:
                product = _parse_next_data(next_raw, url)
                if product:
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

            return ProductData(
                title=title.strip(),
                price_jpy=parse_jpy(price_text),
                price_display=price_text.strip(),
                images=images,
                description=description.strip()[:600],
                marketplace="mercari",
                url=url,
            )
        finally:
            await browser.close()


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
