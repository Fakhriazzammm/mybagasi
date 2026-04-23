from __future__ import annotations

import asyncio
import re
from urllib.parse import parse_qs, quote, quote_plus, urlparse

import httpx
from bs4 import BeautifulSoup

from .dispatcher import scrape_url
from .models import ProductData


SEARCH_DOMAINS = [
    "mercari.com",
    "jp.mercari.com",
    "rakuten.co.jp",
    "amazon.co.jp",
    "auctions.yahoo.co.jp",
    "paypayfleamarket.yahoo.co.jp",
    "zozo.jp",
    "ebay.com",
    "etsy.com",
]

MARKETPLACE_SEARCH_URLS = [
    "https://jp.mercari.com/search?keyword={q}",
    "https://www.mercari.com/us/search/?keyword={q}",
    "https://search.rakuten.co.jp/search/mall/{q}/",
    "https://auctions.yahoo.co.jp/search/search?p={q}",
    "https://www.amazon.co.jp/s?k={q}",
]


def _clean_url(raw: str) -> str:
    if not raw:
        return ""
    if raw.startswith("//"):
        return f"https:{raw}"
    return raw


def _extract_target_url(link: str) -> str:
    href = _clean_url(link)
    if "duckduckgo.com/l/?" in href:
        parsed = urlparse(href)
        q = parse_qs(parsed.query).get("uddg", [""])[0]
        return q
    return href


def _is_ecommerce_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith(f".{d}") for d in SEARCH_DOMAINS)


def _usable_product(p: ProductData) -> bool:
    title = (p.title or "").strip().lower()
    bad = {
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
    return title not in bad and (p.price_display or p.price_jpy or p.images)


async def search_products_by_keyword(
    keyword: str,
    condition: str | None = None,
    size: str | None = None,
    limit: int = 6,
) -> list[ProductData]:
    q = keyword.strip()
    if condition and condition.strip() and condition.strip().lower() != "any":
        q += f" {condition.strip()}"
    if size and size.strip():
        q += f" size {size.strip()}"
    q += " japan marketplace"

    candidates: list[str] = []
    candidates.extend(await _collect_candidates_from_marketplace_search(q))
    candidates.extend(await _collect_candidates_from_duckduckgo(q))
    # de-duplicate while preserving order
    deduped: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
    candidates = deduped[:24]

    products: list[ProductData] = []
    broad_products: list[ProductData] = []
    tokens = _keyword_tokens(keyword)
    for url in candidates:
        try:
            p = await asyncio.wait_for(scrape_url(url), timeout=40)
            if _usable_product(p):
                broad_products.append(p)
                if _relevant_to_keyword(p, tokens):
                    products.append(p)
        except Exception:
            continue
        if len(products) >= limit:
            break

    if products:
        return products[:limit]
    return broad_products[:limit]


async def _collect_candidates_from_duckduckgo(query: str) -> list[str]:
    search_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
    }

    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
        resp = await client.get(search_url)
        resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    candidates: list[str] = []
    for a in soup.select("a.result__a, a[href]"):
        href = (a.get("href") or "").strip()
        target = _extract_target_url(href)
        if not target.startswith("http"):
            continue
        if not _is_ecommerce_url(target):
            continue
        # Exclude generic domain homepages when possible
        path = urlparse(target).path or "/"
        if path in {"/", ""}:
            continue
        if target not in candidates:
            candidates.append(target)
        if len(candidates) >= 12:
            break
    return candidates


async def _collect_candidates_from_marketplace_search(query: str) -> list[str]:
    encoded_query = quote(query)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8",
    }
    candidates: list[str] = []
    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
        for template in MARKETPLACE_SEARCH_URLS:
            url = template.format(q=encoded_query)
            try:
                resp = await client.get(url)
                resp.raise_for_status()
            except Exception:
                continue
            html = resp.text or ""
            found = _extract_ecommerce_links_from_html(html)
            for item_url in found:
                if item_url not in candidates:
                    candidates.append(item_url)
                if len(candidates) >= 16:
                    return candidates
    return candidates


def _extract_ecommerce_links_from_html(html: str) -> list[str]:
    patterns = [
        r"https://jp\.mercari\.com/item/[A-Za-z0-9]+",
        r"https://www\.mercari\.com/us/item/[A-Za-z0-9]+/?",
        r"https://item\.rakuten\.co\.jp/[^\s\"'<>]+",
        r"https://auctions\.yahoo\.co\.jp/jp/auction/[A-Za-z0-9]+",
        r"https://www\.amazon\.co\.jp/[^\s\"'<>]*/dp/[A-Z0-9]{10}",
    ]
    links: list[str] = []
    for pattern in patterns:
        for m in re.findall(pattern, html):
            cleaned = m.rstrip(")'\"")
            if cleaned not in links:
                links.append(cleaned)
    return links


def _keyword_tokens(keyword: str) -> list[str]:
    raw = re.findall(r"[a-zA-Z0-9]+", (keyword or "").lower())
    stop = {
        "carikan",
        "cari",
        "sepatu",
        "ukuran",
        "size",
        "shoes",
        "shoe",
        "japan",
        "marketplace",
    }
    return [t for t in raw if len(t) >= 3 and t not in stop]


def _relevant_to_keyword(product: ProductData, tokens: list[str]) -> bool:
    if not tokens:
        return True
    hay = f"{product.title or ''} {product.description or ''}".lower()
    hits = sum(1 for t in tokens if t in hay)
    # Keep when at least one strong token matches.
    return hits >= 1
