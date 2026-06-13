"""Rakuten Ichiba scraper — httpx + BeautifulSoup (meta tags + JSON-LD based).
Rakuten uses Akamai CDN which may block httpx. Falls back to curl via subprocess."""
from __future__ import annotations

import asyncio
import json
import re

import httpx
from bs4 import BeautifulSoup

from .models import ProductData, parse_jpy


async def scrape_rakuten(url: str) -> ProductData:
    html = await _fetch_rakuten_page(url)
    if not html:
        from .generic import _domain, _parse_empty_product
        return _parse_empty_product(url, _domain(url))

    # Detect charset - Rakuten uses EUC-JP
    if "charset=EUC-JP" in html[:2000] or "charset=euc-jp" in html[:2000]:
        try:
            decoded = html.encode("latin1").decode("euc-jp", errors="replace")
            html = decoded
        except Exception:
            pass

    soup = BeautifulSoup(html, "lxml")

    # Extract from meta tags (og:title, og:image, product:price)
    title = ""
    price_text = ""
    images: list[str] = []
    description = ""

    # Title from meta tags
    og_title = soup.select_one('meta[property="og:title"]')
    if og_title:
        title = og_title.get("content", "").strip()
    if not title:
        tw_title = soup.select_one('meta[name="twitter:title"]')
        if tw_title:
            title = tw_title.get("content", "").strip()
    if not title:
        title_el = soup.select_one("h1, title")
        if title_el:
            title = title_el.get_text(strip=True)

    # Price from og / product meta
    og_price = soup.select_one('meta[property="product:price:amount"]')
    if og_price:
        raw = og_price.get("content", "").strip()
        if raw:
            price_text = f"JPY {raw}"
    if not price_text:
        og_price_name = soup.select_one('meta[name="product:price:amount"]')
        if og_price_name:
            raw = og_price_name.get("content", "").strip()
            if raw:
                price_text = f"JPY {raw}"
    if not price_text:
        # Try JSON-LD
        for script in soup.select('script[type="application/ld+json"]'):
            raw = script.string or ""
            try:
                data = json.loads(raw)
                offers = _find_offers_in_jsonld(data)
                if offers and offers.get("price"):
                    price_text = f"JPY {offers['price']}"
                    break
            except Exception:
                pass
    if not price_text:
        # Fallback: regex in full text
        price_match = re.search(r'(?:[¥￥]|JPY)\s*([\d,]+)', soup.get_text(" ", strip=True))
        if price_match:
            clean = price_match.group(1).replace(",", "")
            try:
                val = int(clean)
                if 100 <= val <= 10_000_000:
                    price_text = f"JPY {clean}"
            except ValueError:
                pass

    # Images
    og_image = soup.select_one('meta[property="og:image"]')
    if og_image:
        img = og_image.get("content", "").strip()
        if img:
            images.append(img)
    tw_image = soup.select_one('meta[name="twitter:image:src"]')
    if tw_image:
        img = tw_image.get("content", "").strip()
        if img and img not in images:
            images.append(img)
    if not images:
        for img in soup.select("img[src]"):
            src = img.get("src", "")
            if src.startswith("http") and any(ext in src.lower() for ext in ['.jpg', '.png', '.jpeg']):
                if src not in images:
                    images.append(src)
                if len(images) >= 3:
                    break

    # Description
    og_desc = soup.select_one('meta[property="og:description"]')
    if og_desc:
        description = og_desc.get("content", "").strip()[:600]
    if not description:
        desc = soup.select_one('meta[name="description"]')
        if desc:
            description = desc.get("content", "").strip()[:600]

    # Seller/shop
    seller = None
    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.string or ""
        try:
            data = json.loads(raw)
            offers = _find_offers_in_jsonld(data)
            if offers and offers.get("seller"):
                seller = offers["seller"]
                break
        except Exception:
            pass

    return ProductData(
        title=title or "Unknown",
        price_jpy=parse_jpy(price_text),
        price_display=price_text,
        images=images[:6],
        description=description,
        seller=seller,
        marketplace="rakuten",
        url=url,
    )


async def _fetch_rakuten_page(url: str) -> str | None:
    """Try httpx first, then curl fallback for Akamai CDN."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    # Try httpx first
    try:
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15) as client:
            resp = await client.get(url)
            text = resp.text
            if len(text) > 500 and "Reference" not in text[:200]:
                return text
    except Exception:
        pass

    # Fallback: curl with --compressed bypasses Akamai blocking
    try:
        proc = await asyncio.create_subprocess_exec(
            "curl", "-sL", "--compressed",
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "-H", "Accept-Language: ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        result = stdout.decode("utf-8", errors="replace")
        if len(result) > 500:
            return result
    except Exception:
        pass

    return None


def _find_offers_in_jsonld(data: dict) -> dict | None:
    """Recursively search for offers in JSON-LD structure."""
    if isinstance(data, dict):
        if data.get("@type") and "product" in str(data.get("@type")).lower():
            offers = data.get("offers")
            if isinstance(offers, dict) and offers.get("price"):
                result = {"price": offers["price"]}
                if offers.get("seller"):
                    result["seller"] = offers["seller"] if isinstance(offers["seller"], str) else offers["seller"].get("name", "")
                return result
            if isinstance(offers, list) and offers:
                result = {"price": offers[0].get("price", "")}
                if offers[0].get("seller"):
                    result["seller"] = offers[0]["seller"] if isinstance(offers[0]["seller"], str) else offers[0]["seller"].get("name", "")
                return result
        for key in ("mainEntity", "@graph"):
            child = data.get(key)
            if isinstance(child, dict):
                result = _find_offers_in_jsonld(child)
                if result:
                    return result
            elif isinstance(child, list):
                for item in child:
                    if isinstance(item, dict):
                        result = _find_offers_in_jsonld(item)
                        if result:
                            return result
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                result = _find_offers_in_jsonld(item)
                if result:
                    return result
    return None
