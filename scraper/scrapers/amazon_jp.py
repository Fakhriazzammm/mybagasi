"""Amazon JP scraper — httpx + BeautifulSoup."""
from __future__ import annotations

import json

import httpx
from bs4 import BeautifulSoup

from .models import BROWSER_HEADERS, ProductData, parse_jpy


async def scrape_amazon(url: str) -> ProductData:
    async with httpx.AsyncClient(
        headers=BROWSER_HEADERS, follow_redirects=True, timeout=20
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Title
    title_el = soup.select_one("#productTitle")
    title = title_el.get_text(strip=True) if title_el else "Unknown"

    # Price — try several selectors Amazon uses
    price_el = soup.select_one(
        ".a-price-whole, #priceblock_ourprice, #priceblock_dealprice, "
        ".a-color-price, .priceToPay .a-price-whole"
    )
    price_text = price_el.get_text(strip=True) if price_el else ""
    price_jpy = parse_jpy(price_text)

    # Images — main image has data-a-dynamic-image (JSON of url→[w,h])
    images: list[str] = []
    main_img = soup.select_one("#landingImage, #imgTagWrapperId img")
    if main_img:
        dynamic = main_img.get("data-a-dynamic-image", "")
        if dynamic:
            try:
                images = list(json.loads(dynamic).keys())[:5]
            except Exception:
                pass
        if not images:
            src = main_img.get("src", "")
            if src:
                images = [src]

    # Description / bullets
    desc_el = soup.select_one("#feature-bullets, #productDescription")
    description = desc_el.get_text(" ", strip=True)[:600] if desc_el else None

    # Availability
    available = bool(
        soup.select_one("#add-to-cart-button, #buy-now-button, #availability span")
    )

    return ProductData(
        title=title,
        price_jpy=price_jpy,
        price_display=f"¥{price_text}" if price_text else "",
        images=images,
        description=description,
        marketplace="amazon_jp",
        available=available,
        url=url,
    )
