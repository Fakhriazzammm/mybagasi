"""Yahoo! Auctions Japan scraper — httpx + BeautifulSoup with JSON-LD first."""
from __future__ import annotations

import json
import re
from typing import Any, Optional

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

    # ── 1) JSON-LD (most reliable) ──
    json_ld_product = _extract_product_json_ld(soup)
    if json_ld_product:
        return json_ld_product

    # ── 2) DOM fallback ──
    return _extract_from_dom(soup, url)


def _extract_product_json_ld(soup: BeautifulSoup) -> Optional[ProductData]:
    """Extract product data from JSON-LD structured data."""
    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.string or script.get_text(strip=True)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue

        node = _find_product_node(data)
        if not node:
            continue

        offers = node.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}

        price = ""
        if isinstance(offers, dict):
            price = str(offers.get("price", ""))
            if not price:
                price = str(offers.get("priceCurrency", ""))

        image = node.get("image", "")
        if isinstance(image, list):
            image = image[0] if image else ""

        # Also get images from og:image
        og_images: list[str] = []
        og_img = soup.find("meta", attrs={"property": "og:image"})
        if og_img and og_img.get("content"):
            og_images.append(og_img["content"])

        # Collect product images from HTML
        html_images: list[str] = []
        for img in soup.select("img[src]"):
            src = (img.get("src") or "").strip()
            if src.startswith("http") and "logo" not in src.lower() and "banner" not in src.lower():
                html_images.append(src)

        images = _dedupe_list(
            ([image] if image else []) + og_images + html_images
        )[:6]

        availability = ""
        if isinstance(offers, dict):
            availability = str(offers.get("availability", ""))

        title = (node.get("name") or "").strip()
        price_display = f"¥{price}" if price and not price.startswith("¥") else price

        return ProductData(
            title=title or "Unknown Product",
            price_jpy=parse_jpy(price_display),
            price_display=price_display,
            condition=None,
            images=images,
            description=(node.get("description") or "")[:600] or None,
            seller=None,
            marketplace="yahoo_auction",
            available="OutOfStock" not in availability,
            url="",
            confidence="high" if title and price else "medium",
            scrape_reason_code="JSONLD",
        )

    return None


def _extract_from_dom(soup: BeautifulSoup, url: str) -> ProductData:
    """Fallback DOM extraction using flexible selectors."""
    # Title — try many patterns
    title = ""
    for sel in [
        "h1",
        "h2",
        "[class*='Title']",
        "[class*='title']",
        "#lblTitleField",
    ]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(strip=True)
            if text and text.lower() not in {"", "unknown"}:
                title = text
                break

    # Price — extract from text content
    price_text = ""
    full_text = soup.get_text(" ", strip=True)
    # Japanese price patterns: 現在 1,100円, 出品価格 1,100, 即決 5,000円
    for pattern in [
        r"現在\s*(\d{1,3}(?:,\d{3})+)\s*円",
        r"出品価格\s*(\d{1,3}(?:,\d{3})+)",
        r"即決\s*(\d{1,3}(?:,\d{3})+)\s*円",
        r"(\d{1,3}(?:,\d{3})+)\s*円",
    ]:
        m = re.search(pattern, full_text)
        if m:
            price_text = f"¥{m.group(1)}"
            break

    # Images
    images: list[str] = []
    for img in soup.select("img[src]"):
        src = (img.get("src") or "").strip()
        if (
            src.startswith("http")
            and "logo" not in src.lower()
            and "banner" not in src.lower()
            and "icon" not in src.lower()
        ):
            images.append(src)
        if len(images) >= 6:
            break

    # Description
    desc = ""
    for sel in [
        "#desc",
        "[class*='Description']",
        "[class*='detail']",
        "[class*='Explanation']",
    ]:
        el = soup.select_one(sel)
        if el:
            desc = el.get_text(" ", strip=True)[:600]
            break

    return ProductData(
        title=title or "Unknown Product",
        price_jpy=parse_jpy(price_text),
        price_display=price_text,
        condition=None,
        images=images,
        description=desc or None,
        seller=None,
        marketplace="yahoo_auction",
        available=True,
        url=url,
        confidence="medium" if title and (price_text or images) else "low",
        scrape_reason_code="DOM",
    )


def _find_product_node(data: Any) -> Optional[dict[str, Any]]:
    """Find Product node in JSON-LD data."""
    if isinstance(data, dict):
        t = data.get("@type", "")
        if isinstance(t, str) and "product" in t.lower():
            return data
        if isinstance(t, list) and any(
            isinstance(v, str) and "product" in v.lower() for v in t
        ):
            return data

        graph = data.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                node = _find_product_node(item)
                if node:
                    return node

    if isinstance(data, list):
        for item in data:
            node = _find_product_node(item)
            if node:
                return node

    return None


def _dedupe_list(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result
