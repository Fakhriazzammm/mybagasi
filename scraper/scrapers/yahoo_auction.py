"""Yahoo! Auctions Japan scraper — httpx + BeautifulSoup."""
from __future__ import annotations

import httpx
from bs4 import BeautifulSoup

from .models import BROWSER_HEADERS, ProductData, parse_jpy


async def scrape_yahoo_auction(url: str) -> ProductData:
    async with httpx.AsyncClient(
        headers=BROWSER_HEADERS, follow_redirects=True, timeout=20
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Title
    title_el = soup.select_one(
        "h1.ProductTitle__text, h1[class*='title'], "
        "h1[class*='Title'], #lblTitleField, h1"
    )
    title = title_el.get_text(strip=True) if title_el else "Unknown"

    # Current bid price
    price_el = soup.select_one(
        ".Price--current dd, .Price--current, "
        "[class*='Price'] [class*='value'], #lblPriceField, "
        ".price dd"
    )
    price_text = price_el.get_text(strip=True) if price_el else ""
    price_jpy = parse_jpy(price_text)

    # Buy-it-now price (if present)
    buynow_el = soup.select_one("[class*='BidPrice--buynow'], [class*='buynow']")
    buynow_text = buynow_el.get_text(strip=True) if buynow_el else ""

    # Images
    images: list[str] = [
        img["src"]
        for img in soup.select(".ProductImage__image img, [class*='image'] img")
        if img.get("src", "").startswith("http")
    ][:6]

    # Description
    desc_el = soup.select_one(
        "#desc, .ProductExplanation__body, [class*='Description'], [class*='detail']"
    )
    description = desc_el.get_text(" ", strip=True)[:600] if desc_el else None

    # Condition
    cond_el = soup.select_one("[class*='Condition'] dd, [class*='condition'] dd")
    condition = cond_el.get_text(strip=True) if cond_el else None

    # Seller
    seller_el = soup.select_one("[class*='Seller'] a, #seller a, .seller a")
    seller = seller_el.get_text(strip=True) if seller_el else None

    # Availability — auction is open if end time exists
    ended_el = soup.select_one("[class*='end'], [class*='End'], [class*='closed']")
    available = ended_el is None

    display = price_text or buynow_text
    return ProductData(
        title=title,
        price_jpy=price_jpy,
        price_display=display,
        condition=condition,
        images=images,
        description=description,
        seller=seller,
        marketplace="yahoo_auction",
        available=available,
        url=url,
    )
