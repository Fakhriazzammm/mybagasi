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
            return await scraper(url)  # type: ignore[operator]
    return await scrape_generic(url)
