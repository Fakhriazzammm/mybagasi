from __future__ import annotations

import asyncio
import re
from collections import defaultdict
from urllib.parse import parse_qs, quote, quote_plus, urlparse
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from .dispatcher import scrape_url
from .generic import scrape_generic_http
from .models import ProductData


SEARCH_DOMAINS = [
    "mercari.com",
    "jp.mercari.com",
    "rakuten.co.jp",
    "amazon.co.jp",
    "auctions.yahoo.co.jp",
    "paypayfleamarket.yahoo.co.jp",
    "zozo.jp",
]

MARKETPLACE_SEARCH_URLS = [
    "https://jp.mercari.com/search?keyword={q}",
    "https://www.mercari.com/us/search/?keyword={q}",
    "https://search.rakuten.co.jp/search/mall/{q}/",
    "https://auctions.yahoo.co.jp/search/search?p={q}",
    "https://www.amazon.co.jp/s?k={q}",
]

# In-memory cache for scraped URLs (simple LRU-like)
_scrape_cache: dict[str, tuple[float, ProductData]] = {}
_cache_max_age = 180  # 3 minutes (shorter cache = fresher results)
_domain_rate_limit: defaultdict[str, float] = defaultdict(float)
_rate_limit_window = 0.5  # 0.5 second per domain (faster)

# Rotate user agents to avoid detection
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
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


def _get_cache_key(url: str) -> str:
    """Generate cache key, normalized URL without tracking params."""
    cleaned = re.sub(r"([?&])(utm_[^=&]+|fbclid|gclid|mc_eid|mc_cid)=[^&]*", "", url)
    cleaned = cleaned.replace("?&", "?").rstrip("?&")
    return cleaned


def _get_cached(url: str) -> Optional[ProductData]:
    """Check cache and return cached product if still valid."""
    key = _get_cache_key(url)
    if key in _scrape_cache:
        timestamp, product = _scrape_cache[key]
        import time
        if time.time() - timestamp < _cache_max_age:
            return product
        else:
            del _scrape_cache[key]
    return None


def _set_cached(url: str, product: ProductData) -> None:
    """Cache a scraped product."""
    key = _get_cache_key(url)
    import time
    _scrape_cache[key] = (time.time(), product)
    # Simple cache size limit (evict oldest if > 100)
    if len(_scrape_cache) > 100:
        oldest_key = min(_scrape_cache.keys(), key=lambda k: _scrape_cache[k][0])
        del _scrape_cache[oldest_key]


async def _wait_rate_limit(url: str) -> None:
    """Apply rate limiting per domain."""
    import time
    domain = (urlparse(url).hostname or "").lower()
    last_call = _domain_rate_limit.get(domain, 0)
    now = time.time()
    elapsed = now - last_call
    if elapsed < _rate_limit_window:
        await asyncio.sleep(_rate_limit_window - elapsed)
    _domain_rate_limit[domain] = time.time()


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

    # Keep results realistic for JP marketplace products.
    # Some listing/index pages can produce concatenated bogus numbers.
    if p.price_jpy is not None and (p.price_jpy < 100 or p.price_jpy > 10_000_000):
        return False

    return title not in bad and (p.price_display or p.price_jpy or p.images)


async def _scrape_candidate_curl_first(url: str, tokens: list[str]) -> ProductData | None:
    """Try HTTP-only extraction first (curl-like), then full scraper fallback."""
    # Check cache first
    cached = _get_cached(url)
    if cached and _usable_product(cached):
        return cached

    await _wait_rate_limit(url)

    # Try lightweight HTTP scraper first (faster timeout)
    try:
        light = await asyncio.wait_for(scrape_generic_http(url), timeout=6)
        if _usable_product(light) and _relevant_to_keyword(light, tokens):
            _set_cached(url, light)
            return light
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass

    # Fallback to full scraper with longer timeout
    await _wait_rate_limit(url)
    try:
        full = await asyncio.wait_for(scrape_url(url), timeout=15)
        if _usable_product(full):
            _set_cached(url, full)
            return full
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass

    return None


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
    # Prioritize direct marketplace search (DuckDuckGo blocked by CAPTCHA)
    candidates.extend(await _collect_candidates_from_marketplace_search(q))
    # DuckDuckGo is currently blocked by CAPTCHA on this IP - skip for now
    # candidates.extend(await _collect_candidates_from_duckduckgo(q))
    # de-duplicate while preserving order
    deduped: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
    candidates = deduped[:8]  # Reduced from 12 to avoid timeout

    if not candidates:
        return []

    tokens = _keyword_tokens(keyword)

    # Parallel scraping with semaphore to limit concurrency
    semaphore = asyncio.Semaphore(4)  # 4 concurrent scrapes

    async def scrape_with_semaphore(url: str) -> ProductData | None:
        async with semaphore:
            return await _scrape_candidate_curl_first(url=url, tokens=tokens)

    # Run scrapes in parallel
    results = await asyncio.gather(
        *[scrape_with_semaphore(url) for url in candidates],
        return_exceptions=True,
    )

    products: list[ProductData] = []
    broad_products: list[ProductData] = []

    for result in results:
        if isinstance(result, Exception):
            continue
        if not result:
            continue

        broad_products.append(result)
        if _relevant_to_keyword(result, tokens):
            products.append(result)

        if len(products) >= limit:
            break

    if products:
        return products[:limit]
    return broad_products[:limit]


async def _collect_candidates_from_duckduckgo(query: str) -> list[str]:
    search_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"
    import random
    headers = {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "DNT": "1",
        "Connection": "keep-alive",
    }

    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
        try:
            resp = await client.get(search_url)
            resp.raise_for_status()
        except Exception:
            return []

    soup = BeautifulSoup(resp.text, "lxml")

    candidates: list[str] = []
    # Aggressive path filtering to exclude generic pages
    bad_paths = {
        "/",
        "",
        "/search",
        "/s",
        "/category",
        "/categories",
        "/shop",
        "/stores",
        "/browse",
        "/products",
        "/shop-all",
    }

    for a in soup.select("a.result__a, a[href]"):
        href = (a.get("href") or "").strip()
        target = _extract_target_url(href)
        if not target.startswith("http"):
            continue
        if not _is_ecommerce_url(target):
            continue

        # Better path filtering
        path = urlparse(target).path or "/"
        if path.lower() in bad_paths:
            continue
        # Exclude very short paths that are likely home pages
        if len(path) < 3:
            continue
        # Must have product-like segments
        if not any(segment in path.lower() for segment in ["item", "product", "dp", "auction", "detail", "goods"]):
            # Still allow if path is long and complex
            if len(path.split("/")) < 3:
                continue

        if target not in candidates:
            candidates.append(target)
        if len(candidates) >= 12:
            break
    return candidates


async def _collect_candidates_from_marketplace_search(query: str) -> list[str]:
    encoded_query = quote(query)
    import random
    headers = {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
        "DNT": "1",
        "Connection": "keep-alive",
    }
    candidates: list[str] = []
    async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=headers) as client:
        for template in MARKETPLACE_SEARCH_URLS:
            try:
                url = template.format(q=encoded_query)
                await _wait_rate_limit(url)  # Apply rate limiting for search queries too
                resp = await client.get(url)
                # Yahoo Auction returns 404 but still has valid content with product links
                # So we don't raise_for_status for it
                if "auctions.yahoo.co.jp" not in url:
                    resp.raise_for_status()
                elif resp.status_code >= 500:
                    continue  # Only skip on 5xx errors for Yahoo Auction
            except Exception as e:
                # Silently continue on error (marketplace might be down or blocking)
                continue

            html = resp.text or ""
            found = _extract_ecommerce_links_from_html(html)
            # Debug logging (can be removed in production)
            if found:
                import sys
                print(f"[DEBUG] Found {len(found)} candidates from {url[:50]}...", file=sys.stderr)
            for item_url in found:
                if item_url not in candidates:
                    candidates.append(item_url)
                if len(candidates) >= 8:  # Reduced from 12
                    return candidates
    return candidates


def _extract_ecommerce_links_from_html(html: str) -> list[str]:
    patterns = [
        # Mercari JP & US
        r"https://jp\.mercari\.com/item/[A-Za-z0-9]+",
        r"https://www\.mercari\.com/us/item/[A-Za-z0-9]+/?",
        r"https://jp\.mercari\.com/en/item/[A-Za-z0-9]+",
        # Rakuten (both formats)
        r"https://item\.rakuten\.co\.jp/[\w-]+/[\w-]+/?",
        r"https://product\.rakuten\.co\.jp/product/[\w-]+/",
        # Yahoo Auctions (both /jp/auction/ and /catalog/detail/ formats)
        r"https://auctions\.yahoo\.co\.jp/jp/auction/[A-Za-z0-9]+",
        r"https://auctions\.yahoo\.co\.jp/catalog/detail/[A-Za-z0-9]+",
        r"https://page\.auctions\.yahoo\.co\.jp/jp/auction/[A-Za-z0-9]+",
        # Amazon (DP pages)
        r"https://www\.amazon\.co\.jp/[\w-]+/dp/[A-Z0-9]{10}(?:/|\?|$)",
        r"https://www\.amazon\.co\.jp/dp/[A-Z0-9]{10}(?:/|\?|$)",
        # PayPay Fleamarket
        r"https://paypayfleamarket\.yahoo\.co\.jp/item/[A-Za-z0-9]+",
    ]
    links: list[str] = []
    for pattern in patterns:
        for m in re.findall(pattern, html):
            # Clean up trailing quotes or parentheses
            cleaned = m
            for ch in [")", "'", '"', ".", "<", ">"]:
                if cleaned.endswith(ch):
                    cleaned = cleaned[:-1]
            # Strip query params for Yahoo Auction (they have many tracking params)
            if "auctions.yahoo.co.jp" in cleaned:
                cleaned = re.sub(r"\?.*", "", cleaned)
                cleaned = cleaned.rstrip("/")
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
