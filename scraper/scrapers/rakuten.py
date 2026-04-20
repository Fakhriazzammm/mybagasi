"""Rakuten Ichiba scraper — httpx + BeautifulSoup."""
from __future__ import annotations

import httpx
from bs4 import BeautifulSoup

from .models import BROWSER_HEADERS, ProductData, parse_jpy


async def scrape_rakuten(url: str) -> ProductData:
    async with httpx.AsyncClient(
        headers=BROWSER_HEADERS, follow_redirects=True, timeout=20
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Title
    title_el = soup.select_one(
        "h1.item-name, h1[class*='item'], .item-desc h1, "
        "#item-title, h1.title, h1"
    )
    title = title_el.get_text(strip=True) if title_el else "Unknown"

    # Price
    price_el = soup.select_one(
        ".price2, .price, [class*='price'], .item-price span, "
        "span.price2, .priceColor"
    )
    price_text = price_el.get_text(strip=True) if price_el else ""
    price_jpy = parse_jpy(price_text)

    # Images
    images: list[str] = []
    for img in soup.select(".rakutenLimitedId_ImageMain img, #main-image img, #item-image img")[:1]:
        src = img.get("src") or img.get("data-src", "")
        if src:
            images.append(src if src.startswith("http") else f"https:{src}")

    for img in soup.select(".rakutenLimitedId_Thumbnail img, .item-thumbnail img")[:5]:
        src = img.get("src") or img.get("data-src", "")
        if src and src not in images:
            images.append(src if src.startswith("http") else f"https:{src}")

    # Description
    desc_el = soup.select_one(
        "#item-description, .item-description, [class*='description'], #item-desc"
    )
    description = desc_el.get_text(" ", strip=True)[:600] if desc_el else None

    # Shop name
    shop_el = soup.select_one(".shop-name, [class*='shop'], #shop-name")
    seller = shop_el.get_text(strip=True) if shop_el else None

    return ProductData(
        title=title,
        price_jpy=price_jpy,
        price_display=price_text,
        images=images[:6],
        description=description,
        seller=seller,
        marketplace="rakuten",
        url=url,
    )
