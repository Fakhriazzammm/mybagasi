from __future__ import annotations

import re
from .models import ProductData
from .mercari import scrape_mercari
from .amazon_jp import scrape_amazon
from .rakuten import scrape_rakuten
from .yahoo_auction import scrape_yahoo_auction
from .generic import scrape_generic

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
                return await scraper(url)  # type: ignore[operator]
            except Exception:
                # Fallback to generic parser when site-specific scraper fails
                # (anti-bot, layout changes, temporary outage, etc).
                result = await scrape_generic(_canonicalize_for_fallback(url))
                return _mark_blocked_if_empty(result)
    result = await scrape_generic(_canonicalize_for_fallback(url))
    return _mark_blocked_if_empty(result)


def _canonicalize_for_fallback(url: str) -> str:
    # Mercari US URLs often block generic fetches; map to JP item route first.
    mercari_item = re.search(r"mercari\.com/(?:us/)?items?/([A-Za-z0-9]+)", url)
    if mercari_item:
        return f"https://jp.mercari.com/item/{mercari_item.group(1)}"
    return url


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
