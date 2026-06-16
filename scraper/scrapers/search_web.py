from __future__ import annotations

import asyncio
import re
from collections import defaultdict
from urllib.parse import parse_qs, quote, quote_plus, urlparse
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from .dispatcher import scrape_url
from .generic import scrape_generic_http, _find_price_from_text
from .models import ProductData, parse_jpy


SEARCH_DOMAINS = [
    "rakuten.co.jp",
    "amazon.co.jp",
    "zozo.jp",
    "shopping.yahoo.co.jp",
    "store.shopping.yahoo.co.jp",
]

MARKETPLACE_SEARCH_URLS = [
    "https://search.rakuten.co.jp/search/mall/{q}/",
    "https://www.amazon.co.jp/s?k={q}",
    "https://zozo.jp/search/?p={q}&p_stype=1",
    "https://shopping.yahoo.co.jp/search?p={q}",
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

    # Try lightweight HTTP scraper first (fast timeout)
    try:
        light = await asyncio.wait_for(scrape_generic_http(url), timeout=5)
        if _usable_product(light):
            _set_cached(url, light)
            return light
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass

    # Fallback to full scraper with longer timeout (18s to accommodate Rakuten/Amazon)
    await _wait_rate_limit(url)
    try:
        full = await asyncio.wait_for(scrape_url(url), timeout=18)
        if _usable_product(full):
            _set_cached(url, full)
            return full
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass

    # Fallback: try Jina AI Reader (bypasses CDN blocks like Akamai/Cloudflare)
    await _wait_rate_limit(url)
    jina_result = await _scrape_via_jina(url)
    if jina_result:
        _set_cached(url, jina_result)
        return jina_result

    return None


async def _scrape_via_jina(url: str) -> ProductData | None:
    """Use Jina AI Reader to scrape a URL. Bypasses most CDN blocks (Akamai, Cloudflare)."""
    mirror_url = f"https://r.jina.ai/http://{url.replace('https://', '').replace('http://', '')}"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(mirror_url, headers={"Accept": "text/plain"})
            resp.raise_for_status()
        text = resp.text or ""
        if not text.strip():
            return None

        title_match = re.search(r"^Title:\s*(.+)$", text, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else ""

        price_text = _find_price_from_text(text)

        img_matches = re.findall(r"!\[[^\]]*\]\((https?://[^)]+)\)", text)
        images = []
        seen: set[str] = set()
        for img in img_matches[:6]:
            if img not in seen:
                seen.add(img)
                images.append(img)

        if not title and not price_text and not images:
            return None

        normalized_title = (title or "").strip().lower()
        bad_titles = {
            "privacy settings", "blocked page", "captcha interception",
            "access denied", "page not found", "not found",
        }
        if normalized_title in bad_titles and not price_text and len(images) < 2:
            return None

        marketplace = (urlparse(url).hostname or "").lower()
        if marketplace.startswith("www."):
            marketplace = marketplace[4:]

        return ProductData(
            title=title or "Unknown Product",
            price_jpy=parse_jpy(price_text),
            price_display=price_text or "",
            images=images,
            description=text[:600] if text else None,
            marketplace=marketplace,
            url=url,
            confidence="medium" if (title and (price_text or images)) else "low",
            scrape_reason_code="JINA_AI",
        )
    except Exception:
        return None


def _translate_indonesian_to_japanese(keyword: str) -> str:
    """Translate common Indonesian shopping terms to Japanese to make search highly effective on JP marketplaces."""
    low = keyword.lower().strip()
    
    # Mapping of common Indonesian shopping terms to Japanese/English equivalents understood by JP e-commerce
    replacements = {
        "bekas": "中古",
        "second": "中古",
        "sec": "中古",
        "preloved": "中古",
        "baru": "新品",
        "grosir": "卸売",
        "murah": "格安",
        "asli": "正規品",
        "ori": "正規品",
        "original": "正規品",
        "lucu": "かわいい",
        "pria": "メンズ",
        "cowok": "メンズ",
        "wanita": "レディース",
        "cewek": "レディース",
        "anak": "キッズ",
        "sepatu": "靴",
        "tas": "バッグ",
        "baju": "服",
        "pakaian": "服",
        "jaket": "ジャケット",
        "kaos": "Tシャツ",
        "topi": "帽子",
        "jam tangan": "時計",
        "mainan": "おもちゃ",
        "boneka": "ぬいぐるみ",
        "makanan": "食品",
        "camilan": "お菓子",
        "snack": "お菓子",
    }
    
    words = low.split()
    translated_words = []
    for w in words:
        if w in replacements:
            translated_words.append(replacements[w])
        else:
            translated_words.append(w)
                
    return " ".join(translated_words)


async def search_products_by_keyword(
    keyword: str,
    condition: str | None = None,
    size: str | None = None,
    limit: int = 6,
) -> list[ProductData]:
    """Search for products by keyword with automatic shortening fallback.

    Tries progressively shorter keyword variations when the full keyword
    returns no relevant results. Total timeout is 40 seconds.
    """
    total_timeout = 40.0

    async def _search_with_timeout() -> list[ProductData]:
        # Generate progressively shorter keyword variations
        base = keyword.strip()
        parts = base.split()
        variations: list[str] = []
        for i in range(len(parts), 0, -1):
            variations.append(" ".join(parts[:i]))

        for kw in variations:
            # Translate keyword from Indonesian to Japanese for JP marketplaces
            translated_kw = _translate_indonesian_to_japanese(kw)

            # Build query WITHOUT "japan buy" for marketplace search
            marketplace_q = translated_kw
            if condition and condition.strip() and condition.strip().lower() != "any":
                marketplace_q += f" {condition.strip()}"
            if size and size.strip():
                marketplace_q += f" size {size.strip()}"

            # Build query WITH "japan buy" for Google/Bing fallback
            web_q = translated_kw + " japan buy"

            candidates: list[str] = []

            # Step 1: Direct marketplace search (no "japan buy" suffix)
            candidates.extend(await _collect_candidates_from_marketplace_search(marketplace_q))

            # Step 2: Google fallback (with "japan buy")
            if not candidates:
                candidates.extend(await _collect_candidates_from_google(web_q))

            # Step 3: Bing fallback (with "japan buy")
            if not candidates:
                candidates.extend(await _collect_candidates_from_bing(web_q))

            # Deduplicate while preserving order
            deduped: list[str] = []
            seen: set[str] = set()
            for c in candidates:
                if c not in seen:
                    seen.add(c)
                    deduped.append(c)
            candidates = deduped[:4]

            if not candidates:
                continue  # No results for this keyword variant, try shorter one

            tokens = _keyword_tokens(kw)

            # Parallel scraping with semaphore to limit concurrency
            semaphore = asyncio.Semaphore(6)

            async def _scrape_one(url: str, toks: list[str]) -> ProductData | None:
                async with semaphore:
                    return await _scrape_candidate_curl_first(url=url, tokens=toks)

            results = await asyncio.gather(
                *[_scrape_one(url, tokens) for url in candidates],
                return_exceptions=True,
            )

            products: list[ProductData] = []
            broad_products: list[ProductData] = []

            for result in results:
                if isinstance(result, BaseException):
                    continue
                if not result:
                    continue

                # Skip hard exclusions (e.g. accessories when the user did not search for them)
                if _is_hard_exclusion(result, tokens):
                    continue

                broad_products.append(result)
                if _relevant_to_keyword(result, tokens):
                    products.append(result)

                if len(products) >= limit:
                    break

            if products:
                return products[:limit]
            if broad_products:
                return broad_products[:limit]

            # No relevant products found, try shorter keyword
            continue

        return []

    try:
        return await asyncio.wait_for(_search_with_timeout(), timeout=total_timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        return []


async def _collect_candidates_from_google(query: str) -> list[str]:
    """Search Google for product URLs, works more reliably than DuckDuckGo."""
    search_url = f"https://www.google.com/search?q={quote_plus(query)}&hl=en&num=15"
    import random
    headers = {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "DNT": "1",
    }

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers=headers) as client:
            resp = await client.get(search_url)
            if resp.status_code != 200:
                return []
    except Exception:
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    candidates: list[str] = []

    for a in soup.select("a[href]"):
        href = a.get("href", "").strip()
        if href.startswith("/url?q="):
            href = href.split("/url?q=")[1].split("&")[0]
            href = _clean_url(href)
        if not href.startswith("http"):
            continue
        if not _is_ecommerce_url(href):
            continue
        if href not in candidates:
            candidates.append(href)

    return candidates


async def _collect_candidates_from_bing(query: str) -> list[str]:
    """Search Bing for product URLs."""
    search_url = f"https://www.bing.com/search?q={quote_plus(query)}"
    import random
    headers = {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "DNT": "1",
    }

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers=headers) as client:
            resp = await client.get(search_url)
            if resp.status_code != 200:
                return []
    except Exception:
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    candidates: list[str] = []

    for a in soup.select("a[href]"):
        href = a.get("href", "").strip()
        if not href.startswith("http"):
            continue
        if not _is_ecommerce_url(href):
            continue
        if href not in candidates:
            candidates.append(href)

    return candidates


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
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
        for template in MARKETPLACE_SEARCH_URLS:
            try:
                url = template.format(q=encoded_query)
                await _wait_rate_limit(url)
                resp = await client.get(url)
                resp.raise_for_status()
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
        # Rakuten (both formats)
        r"https://item\.rakuten\.co\.jp/[\w-]+/[\w-]+/?(?:\?|$|[\s<>\"'])",
        r"https://product\.rakuten\.co\.jp/product/[\w-]+/?(?:\?|$|[\s<>\"'])",
        # Amazon (DP pages + gp/product)
        r"https://www\.amazon\.co\.jp/[\w-]+/dp/[A-Z0-9]{10}(?:/|\?|$|[\s<>\"'])",
        r"https://www\.amazon\.co\.jp/dp/[A-Z0-9]{10}(?:/|\?|$|[\s<>\"'])",
        r"https://www\.amazon\.co\.jp/gp/product/[A-Z0-9]{10}(?:/|\?|$|[\s<>\"'])",
        # ZOZO (shop/goods format + direct goods)
        r"https://zozo\.jp/shop/[\w-]+/goods/[\w-]+(?:/|\?|$|[\s<>\"'])",
        r"https://zozo\.jp/shop/[\w-]+/product/[\w-]+(?:/|\?|$|[\s<>\"'])",
        r"https://zozo\.jp/[\w-]+/goods/\d+(?:/|\?|$|[\s<>\"'])",
        r"https://zozo\.jp/goods/\d+(?:/|\?|$|[\s<>\"'])",
        # Yahoo Shopping store products
        r"https://store\.shopping\.yahoo\.co\.jp/[\w-]+/[\w-]+(?:\.html)?(?:/|\?|$|[\s<>\"'])",
        r"https://store\.shopping\.yahoo\.co\.jp/[\w-]+/\d+(?:/|\?|$|[\s<>\"'])",
        # Yahoo Shopping general
        r"https://shopping\.yahoo\.co\.jp/[\w-]+/\d+(?:/|\?|$|[\s<>\"'])",
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


def _is_hard_exclusion(product: ProductData, tokens: list[str]) -> bool:
    title = (product.title or "").lower()
    
    # Heuristic to filter out accessory false positives (e.g. cases, films, covers)
    # when searching for electronic devices (like iPad, iPhone, camera, console, etc.)
    accessory_keywords_jp = ["ケース", "カバー", "フィルム", "ガラス", "ストラップ", "スタンド", "保護", "充電器", "ケーブル"]
    accessory_keywords_en = ["case", "cover", "film", "glass", "strap", "stand", "protector", "charger", "cable", "sleeve", "bag", "pouch"]
    accessory_keywords_id = ["casing", "pelindung", "tempered", "charger", "kabel", "tas", "dompet"]
    
    all_acc = accessory_keywords_jp + accessory_keywords_en + accessory_keywords_id
    
    # Check if any token represents an accessory (e.g., if the user explicitly searched for "case ipad")
    has_accessory_token = any(any(acc in t for acc in all_acc) for t in tokens)
    
    if not has_accessory_token:
        # If user did NOT search for an accessory, but the product title contains an accessory keyword
        # we treat it as a hard exclusion
        if any(acc in title for acc in all_acc):
            return True
            
    return False


def _relevant_to_keyword(product: ProductData, tokens: list[str]) -> bool:
    if not tokens:
        return True
    hay = f"{product.title or ''} {product.description or ''}".lower()
    hits = sum(1 for t in tokens if t in hay)
    # Keep when at least one strong token matches.
    return hits >= 1