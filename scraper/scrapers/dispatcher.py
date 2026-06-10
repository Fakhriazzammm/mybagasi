from __future__ import annotations

import asyncio
import logging
import re
from .models import ProductData
from .mercari import scrape_mercari
from .amazon_jp import scrape_amazon
from .rakuten import scrape_rakuten
from .yahoo_auction import scrape_yahoo_auction
from .generic import scrape_generic
from .vision_extract import extract_product_via_screenshot_ai
from .browser import scrape_with_browser as browser_scrape

log = logging.getLogger("mybagasi_dispatcher")

_ROUTES: list[tuple[str, object]] = [
    (r"(jp\.)?mercari\.com", scrape_mercari),
    (r"amazon\.co\.jp", scrape_amazon),
    (r"rakuten\.co\.jp", scrape_rakuten),
    (r"auctions\.yahoo\.co\.jp", scrape_yahoo_auction),
]

async def scrape_url(url: str) -> ProductData:
    for pattern, scraper in _ROUTES:
        if re.search(pattern, url):
            try:
                primary = await scraper(url)
                if not _needs_fallback(primary):
                    return primary
                # HTTP gagal → coba browser
                browser_result = await _browser_scrape_with_fallback(url)
                if browser_result:
                    return browser_result
                # Browser gagal → screenshot AI
                return await _maybe_screenshot_ai_fallback(url, primary)
            except Exception:
                # HTTP scraper exception → coba browser
                browser_result = await _browser_scrape_with_fallback(url)
                if browser_result:
                    return browser_result
                result = await scrape_generic(_canonicalize_for_fallback(url))
                result = _mark_blocked_if_empty(result)
                return await _maybe_screenshot_ai_fallback(url, result)
    # No pattern match → try browser, then generic
    browser_result = await _browser_scrape_with_fallback(url)
    if browser_result:
        return browser_result
    result = await scrape_generic(_canonicalize_for_fallback(url))
    result = _mark_blocked_if_empty(result)
    return await _maybe_screenshot_ai_fallback(url, result)


async def _browser_scrape_with_fallback(url: str) -> ProductData | None:
    """Try browser scraping, return ProductData if successful."""
    try:
        raw = await asyncio.wait_for(browser_scrape(url), timeout=25.0)
        if raw and not raw.get("error") and raw.get("title") and raw.get("price_jpy"):
            return ProductData(
                title=(raw["title"] or "")[:200],
                price_jpy=raw.get("price_jpy"),
                price_display=f"¥{raw['price_jpy']:,}" if raw.get("price_jpy") else "",
                images=[raw["image"]] if raw.get("image") else [],
                description=(raw.get("description") or "")[:500],
                marketplace=raw.get("marketplace", "Japan Marketplace"),
                available=raw.get("available", True) or False,
                url=url,
                confidence="medium",
                scrape_reason_code="BROWSER_OK",
            )
    except asyncio.TimeoutError:
        log.warning(f"Browser scrape timeout: {url[:60]}")
    except Exception as e:
        log.warning(f"Browser scrape error: {e}")
    return None


def _needs_fallback(product: ProductData) -> bool:
    """Check if product data is incomplete and needs a fallback."""
    reason = (product.scrape_reason_code or "").upper()
    return reason in ("BLOCKED", "PARSE_EMPTY", "NOT_FOUND") or not product.price_jpy


def _canonicalize_for_fallback(url: str) -> str:
    return url.strip()


def _mark_blocked_if_empty(product: ProductData) -> ProductData:
    if (
        "mercari" in (product.marketplace or "").lower()
        and product.scrape_reason_code == "PARSE_EMPTY"
        and not product.price_display
        and not product.images
        and (product.title or "").strip().lower() in {"", "unknown", "unknown product"}
    ):
        product.title = "Blocked page"
        product.description = "Halaman Mercari terproteksi anti-bot/CAPTCHA. Coba minta link alternatif atau pencarian manual."
        product.scrape_reason_code = "BLOCKED"
    return product


async def _maybe_screenshot_ai_fallback(url: str, product: ProductData) -> ProductData:
    if not _needs_screenshot_ai(product):
        return product
    try:
        ai_result = await asyncio.wait_for(
            extract_product_via_screenshot_ai(url, product.marketplace),
            timeout=25.0,
        )
        if ai_result:
            return ai_result
    except (asyncio.TimeoutError, Exception):
        pass

    return product


def _needs_screenshot_ai(product: ProductData) -> bool:
    reason = (product.scrape_reason_code or "").upper()
    title = (product.title or "").strip().lower()
    desc = (product.description or "").strip().lower()
    domain_like_title = bool(re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", title))
    suspicious_titles = {
        "",
        "unknown",
        "unknown product",
        "blocked page",
        "not found",
        "page not found",
        "captcha interception",
        "privacy settings",
        "access denied",
        "your go-to marketplace for deals on used & secondhand items",
    }
    hard_404_signal = "target url returned error 404" in desc
    suspicious_title_only = title in suspicious_titles
    low_signal = (
        (domain_like_title or suspicious_title_only)
        and not product.price_display
        and not product.images
    )
    return (
        reason in {"BLOCKED", "PARSE_EMPTY", "NOT_FOUND"}
        or hard_404_signal
        or suspicious_title_only
        or low_signal
    )
