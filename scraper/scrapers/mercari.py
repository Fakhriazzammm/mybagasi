"""
Mercari scraper (US + JP variants).

Strategy:
1) Try multiple canonical URL candidates for the same item id (US item/items, JP item/items)
2) Parse Next.js data first, then DOM selectors
3) Fallback to Crawl4AI
4) Return structured NOT_FOUND/BLOCKED when applicable (instead of raising raw HTTP errors)
"""
from __future__ import annotations

import json
import re
from typing import Optional

from playwright.async_api import async_playwright

from .generic import _crawl4ai
from .models import ProductData, parse_jpy


async def scrape_mercari(url: str) -> ProductData:
    candidates = _build_mercari_candidates(url)
    if not candidates:
        raise ValueError("URL_INVALID: format link Mercari tidak valid")

    saw_not_found = False
    saw_blocked = False
    last_error: Optional[Exception] = None

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
            extra_http_headers={"Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8"},
        )

        try:
            for candidate in candidates:
                page = await context.new_page()
                try:
                    await _apply_stealth(page)
                    response = await page.goto(
                        candidate, wait_until="domcontentloaded", timeout=45_000
                    )
                    await page.wait_for_timeout(1200)

                    status = response.status if response else None
                    if status in (404, 410):
                        saw_not_found = True
                        continue
                    if status in (401, 403, 429):
                        saw_blocked = True
                        continue

                    # 1) Next.js payload
                    next_raw: Optional[str] = await page.evaluate(
                        "() => document.getElementById('__NEXT_DATA__')?.textContent"
                    )
                    if next_raw:
                        parsed = _parse_next_data(next_raw, candidate)
                        if parsed and _is_useful_product(parsed):
                            parsed.confidence = "high"
                            parsed.scrape_reason_code = "PLAYWRIGHT"
                            return parsed

                    # 2) DOM fallback
                    title = (await page.locator("h1").first.text_content(timeout=8_000)) or ""
                    og_title = await page.evaluate(
                        "() => document.querySelector('meta[property=\"og:title\"]')?.content || ''"
                    )
                    doc_title = await page.title()
                    title = _normalize_dom_title(title, og_title, doc_title)

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

                    candidate_product = ProductData(
                        title=title.strip() or "Unknown Product",
                        price_jpy=parse_jpy(price_text),
                        price_display=price_text.strip(),
                        images=images,
                        description=description.strip()[:600] or None,
                        marketplace="mercari",
                        url=candidate,
                        confidence="medium" if title.strip() and images else "low",
                        scrape_reason_code="PLAYWRIGHT",
                    )
                    if _is_useful_product(candidate_product):
                        return candidate_product

                    # 3) Crawl4AI fallback for this candidate
                    crawl_result = await _crawl4ai_fallback(candidate)
                    if _is_useful_product(crawl_result):
                        return crawl_result
                    if (crawl_result.scrape_reason_code or "").upper() == "BLOCKED":
                        saw_blocked = True

                except Exception as e:
                    last_error = e
                finally:
                    await page.close()

            if saw_not_found and not saw_blocked:
                return _not_found_product(candidates[0])
            if saw_blocked:
                return _blocked_product(candidates[0])
            if last_error:
                raise last_error
            return _not_found_product(candidates[0])
        finally:
            await browser.close()


async def _crawl4ai_fallback(url: str) -> ProductData:
    product = await _crawl4ai(url)
    product.marketplace = "mercari"
    product.url = url
    product.confidence = "medium" if product.price_jpy and product.images else "low"
    product.scrape_reason_code = product.scrape_reason_code or "CRAWL4AI"
    return product


def _build_mercari_candidates(url: str) -> list[str]:
    raw = url.strip()
    item_id = _extract_item_id(raw)

    # No recognizable item id; try raw URL as-is.
    if not item_id:
        return [raw] if "mercari.com" in raw else []

    candidates = [
        f"https://www.mercari.com/us/item/{item_id}/",
        f"https://www.mercari.com/us/items/{item_id}/",
        f"https://jp.mercari.com/item/{item_id}",
        f"https://jp.mercari.com/items/{item_id}",
        raw,
    ]

    deduped: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        normalized = c.rstrip("/") if "jp.mercari.com" in c else c
        if normalized not in seen:
            seen.add(normalized)
            deduped.append(c)
    return deduped


def _extract_item_id(url: str) -> Optional[str]:
    m = re.search(r"/((?:us/)?items?|item)/([A-Za-z0-9]+)", url)
    return m.group(2) if m else None


def _is_useful_product(product: ProductData) -> bool:
    title = (product.title or "").strip().lower()
    invalid_titles = {
        "",
        "unknown",
        "unknown product",
        "blocked page",
        "privacy settings",
        "access denied",
    }
    has_title = bool(title and title not in invalid_titles)
    has_price = bool(product.price_jpy or product.price_display)
    has_media = bool(product.images)
    return has_title or has_price or has_media


def _normalize_dom_title(h1_title: str, og_title: str, doc_title: str) -> str:
    candidates = [h1_title.strip(), og_title.strip(), doc_title.strip()]
    invalid = {"", "privacy settings", "access denied", "blocked page"}
    for t in candidates:
        low = t.lower()
        if low in invalid:
            continue
        cleaned = re.sub(r"\s*\|\s*mercari.*$", "", t, flags=re.IGNORECASE).strip()
        if cleaned and cleaned.lower() not in invalid:
            return cleaned
    return h1_title.strip()


def _blocked_product(url: str) -> ProductData:
    return ProductData(
        title="Blocked page",
        price_jpy=None,
        price_display="",
        images=[],
        description="Halaman Mercari terproteksi anti-bot/CAPTCHA. Coba link alternatif atau marketplace lain.",
        marketplace="mercari",
        url=url,
        confidence="low",
        scrape_reason_code="BLOCKED",
    )


def _not_found_product(url: str) -> ProductData:
    return ProductData(
        title="Not found",
        price_jpy=None,
        price_display="",
        images=[],
        description="Produk tidak ditemukan atau link sudah tidak aktif.",
        marketplace="mercari",
        available=False,
        url=url,
        confidence="low",
        scrape_reason_code="NOT_FOUND",
    )


async def _apply_stealth(page) -> None:
    try:
        from playwright_stealth import stealth_async  # type: ignore

        await stealth_async(page)
    except Exception:
        return


def _parse_next_data(raw: str, url: str) -> Optional[ProductData]:
    try:
        data = json.loads(raw)
        props = data.get("props", {}).get("pageProps", {})
        item: Optional[dict] = props.get("item") or props.get("itemDetail", {}).get("item")
        if not item:
            return None

        price = item.get("price", 0)
        photos = item.get("photos") or item.get("thumbnails") or []
        images = [p.get("imageUrl") or p.get("url", "") for p in photos if isinstance(p, dict)]

        return ProductData(
            title=item.get("name", "").strip() or "Unknown Product",
            price_jpy=int(price) if price else None,
            price_display=f"JPY {int(price):,}" if price else "",
            condition=_cond(item),
            images=[img for img in images if img][:6],
            description=(item.get("description") or "").strip()[:600] or None,
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
