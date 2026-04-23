from __future__ import annotations

import asyncio
import re
from .models import ProductData
from .mercari import scrape_mercari
from .amazon_jp import scrape_amazon
from .rakuten import scrape_rakuten
from .yahoo_auction import scrape_yahoo_auction
from .generic import scrape_generic
from .vision_extract import extract_product_via_screenshot_ai
from .hermes_browser import hermes_browser_scrape

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
                primary = await scraper(url)  # type: ignore[operator]
                return await _maybe_screenshot_ai_fallback(url, primary)
            except Exception:
                # Fallback to generic parser when site-specific scraper fails
                # (anti-bot, layout changes, temporary outage, etc).
                result = await scrape_generic(_canonicalize_for_fallback(url))
                result = _mark_blocked_if_empty(result)
                return await _maybe_screenshot_ai_fallback(url, result)
    result = await scrape_generic(_canonicalize_for_fallback(url))
    result = _mark_blocked_if_empty(result)
    return await _maybe_screenshot_ai_fallback(url, result)


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

    # Final fallback: try Hermes browser
    return await _maybe_hermes_browser_fallback(url, product)


async def _maybe_hermes_browser_fallback(url: str, product: ProductData) -> ProductData:
    """Try Hermes browser scraping when all other methods produce blocked/empty results."""
    reason = (product.scrape_reason_code or "").upper()
    # Only try Hermes browser for truly blocked or empty results
    if reason not in {"BLOCKED", "PARSE_EMPTY"}:
        return product
    try:
        hermes_result = await asyncio.wait_for(
            hermes_browser_scrape(url, max_wait=90),
            timeout=95.0,
        )
        if hermes_result and hermes_result.title and hermes_result.title not in {
            "Blocked page", "Unknown Product", "Not found"
        }:
            return hermes_result
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
