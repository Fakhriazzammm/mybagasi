"""
Generic scraper for unknown / dynamic e-commerce URLs.

Strategy order:
1) Crawl4AI (if available) and parse JSON-LD / meta / markdown signals
2) httpx + BeautifulSoup fallback with the same product extraction logic
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .models import BROWSER_HEADERS, ProductData, parse_jpy


PRICE_PATTERN = re.compile(
    r"(?:[¥￥円]|JPY|IDR|Rp|USD|GBP|EUR|\$|£|€)\s?[\d.,]+",
    re.IGNORECASE,
)
TRACKING_PARAMS = re.compile(r"([?&])(utm_[^=&]+|fbclid|gclid|mc_eid|mc_cid)=[^&]*")


async def scrape_generic(url: str) -> ProductData:
    normalized_url = _normalize_url(url)
    try:
        product = await _crawl4ai(normalized_url)
        if _should_try_mirror(product):
            mirror = await _jina_mirror_fallback(normalized_url)
            if mirror:
                return mirror
        return product
    except Exception:
        product = await _bs4_fallback(normalized_url)
        if _should_try_mirror(product):
            mirror = await _jina_mirror_fallback(normalized_url)
            if mirror:
                return mirror
        return product


async def _crawl4ai(url: str) -> ProductData:
    from crawl4ai import AsyncWebCrawler  # type: ignore

    async with AsyncWebCrawler(verbose=False) as crawler:
        result = await crawler.arun(url=url, bypass_cache=True)

    content: str = getattr(result, "markdown", "") or ""
    meta: dict[str, Any] = getattr(result, "metadata", {}) or {}
    media: dict[str, Any] = getattr(result, "media", {}) or {}
    html: str = getattr(result, "html", "") or ""

    soup = BeautifulSoup(html, "lxml") if html else BeautifulSoup("", "lxml")
    extracted = _extract_product_fields(soup, content, meta, url)
    resolved_title = extracted["title"] or meta.get("title") or _heading(content) or "Unknown Product"
    if _is_blocked_page(resolved_title, extracted["description"], content):
        return _blocked_product(url, _domain(url))
    if _is_low_signal_result(resolved_title, extracted["price_display"], extracted["images"]):
        return _parse_empty_product(url, _domain(url))

    images = extracted["images"] or [
        img["src"]
        for img in (media.get("images") or [])
        if isinstance(img, dict) and img.get("src", "").startswith("http")
    ][:6]

    return ProductData(
        title=resolved_title,
        price_jpy=parse_jpy(extracted["price_display"] or ""),
        price_display=extracted["price_display"] or "",
        condition=extracted["condition"],
        images=images,
        description=(extracted["description"] or content[:600] or None),
        seller=extracted["seller"],
        marketplace=_domain(url),
        available=extracted["available"],
        url=url,
        confidence="medium" if extracted["title"] and (images or extracted["price_display"]) else "low",
        scrape_reason_code="CRAWL4AI",
    )


async def _bs4_fallback(url: str) -> ProductData:
    async with httpx.AsyncClient(
        headers=BROWSER_HEADERS, follow_redirects=True, timeout=20
    ) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (404, 410):
                return _not_found_product(url, _domain(url))
            if e.response.status_code in (401, 403, 429):
                return _blocked_product(url, _domain(url))
            raise

    soup = BeautifulSoup(resp.text, "lxml")
    extracted = _extract_product_fields(soup, "", {}, url)
    resolved_title = extracted["title"] or "Unknown Product"
    if _is_blocked_page(resolved_title, extracted["description"], soup.get_text(" ", strip=True)):
        return _blocked_product(url, _domain(url))
    if _is_low_signal_result(resolved_title, extracted["price_display"], extracted["images"]):
        return _parse_empty_product(url, _domain(url))

    return ProductData(
        title=resolved_title,
        price_jpy=parse_jpy(extracted["price_display"] or ""),
        price_display=extracted["price_display"] or "",
        condition=extracted["condition"],
        images=extracted["images"],
        description=extracted["description"],
        seller=extracted["seller"],
        marketplace=_domain(url),
        available=extracted["available"],
        url=url,
        confidence="medium" if extracted["title"] and (extracted["images"] or extracted["price_display"]) else "low",
        scrape_reason_code="PARSE_EMPTY" if not extracted["price_display"] else "PLAYWRIGHT",
    )


def _extract_product_fields(
    soup: BeautifulSoup, markdown: str, meta: dict[str, Any], page_url: str
) -> dict[str, Any]:
    json_ld = _extract_product_json_ld(soup)

    title = (
        _first_non_empty(
            json_ld.get("name"),
            _meta_content(soup, "property", "og:title"),
            _meta_content(soup, "name", "twitter:title"),
            _text(soup, "h1"),
            meta.get("title"),
            _heading(markdown),
        )
        or ""
    )

    price_display = _first_non_empty(
        json_ld.get("price"),
        _meta_content(soup, "property", "product:price:amount"),
        _meta_content(soup, "name", "product:price:amount"),
        _text(soup, "[class*='price'], [id*='price'], .price, .price_color"),
        _find_price_from_text(soup.get_text(" ", strip=True)),
        _find_price_from_text(markdown),
    ) or ""

    description = _first_non_empty(
        json_ld.get("description"),
        _meta_content(soup, "name", "description"),
        _meta_content(soup, "property", "og:description"),
    )
    if description:
        description = description.strip()[:600]

    images = _extract_images(soup, json_ld, page_url)

    return {
        "title": _clean_text(title),
        "price_display": _normalize_price_display(price_display),
        "description": description,
        "images": images,
        "seller": _clean_text(_first_non_empty(json_ld.get("seller"), json_ld.get("brand")) or "") or None,
        "condition": _clean_text(json_ld.get("condition") or "") or None,
        "available": _to_available(json_ld.get("availability")),
    }


def _extract_product_json_ld(soup: BeautifulSoup) -> dict[str, str]:
    scripts = soup.select('script[type="application/ld+json"]')
    for script in scripts:
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

        seller = node.get("brand")
        if isinstance(seller, dict):
            seller = seller.get("name")

        if isinstance(offers, dict):
            offer_seller = offers.get("seller")
            if isinstance(offer_seller, dict) and offer_seller.get("name"):
                seller = offer_seller.get("name")

        image = node.get("image")
        if isinstance(image, list):
            image = image[0] if image else ""

        return {
            "name": _safe_str(node.get("name")),
            "description": _safe_str(node.get("description")),
            "price": _safe_str((offers or {}).get("price")) or _safe_str(node.get("price")),
            "availability": _safe_str((offers or {}).get("availability")),
            "condition": _safe_str(node.get("itemCondition")),
            "brand": _safe_str(seller),
            "seller": _safe_str(seller),
            "image": _safe_str(image),
        }

    return {}


def _find_product_node(data: Any) -> Optional[dict[str, Any]]:
    if isinstance(data, dict):
        if _is_product_type(data.get("@type")):
            return data

        graph = data.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                if isinstance(item, dict) and _is_product_type(item.get("@type")):
                    return item

        main_entity = data.get("mainEntity")
        if isinstance(main_entity, dict) and _is_product_type(main_entity.get("@type")):
            return main_entity

    if isinstance(data, list):
        for item in data:
            node = _find_product_node(item)
            if node:
                return node

    return None


def _is_product_type(type_value: Any) -> bool:
    if isinstance(type_value, str):
        return "product" in type_value.lower()
    if isinstance(type_value, list):
        return any(isinstance(v, str) and "product" in v.lower() for v in type_value)
    return False


def _extract_images(soup: BeautifulSoup, json_ld: dict[str, str], page_url: str) -> list[str]:
    images: list[str] = []

    if json_ld.get("image"):
        images.append(json_ld["image"])

    for key in ["og:image", "twitter:image"]:
        value = _meta_content(soup, "property" if key.startswith("og") else "name", key)
        if value:
            images.append(value)

    for img in soup.select("img[src]"):
        src = (img.get("src") or "").strip()
        if src:
            images.append(src if src.startswith("http") else urljoin(page_url, src))
        if len(images) >= 12:
            break

    deduped: list[str] = []
    seen: set[str] = set()
    for img in images:
        if img not in seen:
            seen.add(img)
            deduped.append(img)
        if len(deduped) >= 6:
            break

    return deduped


def _meta_content(soup: BeautifulSoup, attr: str, key: str) -> str:
    node = soup.find("meta", attrs={attr: key})
    return (node.get("content") or "").strip() if node else ""


def _text(soup: BeautifulSoup, selector: str) -> str:
    node = soup.select_one(selector)
    return node.get_text(" ", strip=True) if node else ""


def _find_price_from_text(text: str) -> str:
    if not text:
        return ""
    m = PRICE_PATTERN.search(text)
    return m.group(0).strip() if m else ""


def _normalize_price_display(price: str) -> str:
    if not price:
        return ""
    p = price.strip()
    if re.fullmatch(r"[\d.,]+", p):
        return f"JPY {p}"
    return p


def _to_available(availability: Optional[str]) -> bool:
    if not availability:
        return True
    value = availability.lower()
    if "outofstock" in value or "soldout" in value:
        return False
    return True


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value.strip()
    return ""


def _first_non_empty(*values: Any) -> Optional[str]:
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _heading(markdown: str) -> str:
    m = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    return m.group(1).strip() if m else ""


def _domain(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname or "generic"


def _normalize_url(url: str) -> str:
    stripped = url.strip()
    cleaned = TRACKING_PARAMS.sub("", stripped)
    cleaned = cleaned.replace("?&", "?").rstrip("?&")
    return cleaned


def _is_blocked_page(title: str, description: Optional[str], text: str) -> bool:
    content = f"{title or ''} {description or ''} {text or ''}".lower()
    signals = [
        "access denied",
        "just a moment",
        "are you human",
        "captcha",
        "captcha interception",
        "cloudflare",
        "request blocked",
        "forbidden",
        "bot detection",
        "verify you are human",
        "unusual traffic",
        "slide to verify",
        "年齢認証",
        "18歳未満",
        "18歳以上ですか",
    ]
    return any(s in content for s in signals)


def _blocked_product(url: str, marketplace: str) -> ProductData:
    return ProductData(
        title="Blocked page",
        price_jpy=None,
        price_display="",
        images=[],
        description="Halaman produk diblokir anti-bot / CAPTCHA. Coba link alternatif atau marketplace lain.",
        marketplace=marketplace,
        url=url,
        confidence="low",
        scrape_reason_code="BLOCKED",
    )


def _not_found_product(url: str, marketplace: str) -> ProductData:
    return ProductData(
        title="Not found",
        price_jpy=None,
        price_display="",
        images=[],
        description="Produk tidak ditemukan atau link sudah tidak aktif.",
        marketplace=marketplace,
        available=False,
        url=url,
        confidence="low",
        scrape_reason_code="NOT_FOUND",
    )


def _should_try_mirror(product: ProductData) -> bool:
    reason = (product.scrape_reason_code or "").upper()
    return reason in {"BLOCKED", "NOT_FOUND", "PARSE_EMPTY"}


def _is_low_signal_result(title: str, price_display: str, images: list[str]) -> bool:
    t = (title or "").strip().lower()
    domain_like = bool(re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", t))
    bad_titles = {
        "",
        "unknown",
        "unknown product",
        "not found",
        "page not found",
        "captcha interception",
        "privacy settings",
        "access denied",
    }
    return (t in bad_titles or domain_like) and not (price_display or images)


def _parse_empty_product(url: str, marketplace: str) -> ProductData:
    return ProductData(
        title="Unknown Product",
        price_jpy=None,
        price_display="",
        images=[],
        description="Detail produk belum bisa diekstrak dari halaman.",
        marketplace=marketplace,
        url=url,
        confidence="low",
        scrape_reason_code="PARSE_EMPTY",
    )


async def _jina_mirror_fallback(url: str) -> Optional[ProductData]:
    mirror_url = f"https://r.jina.ai/http://{url.replace('https://', '').replace('http://', '')}"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(mirror_url)
            resp.raise_for_status()
        text = resp.text or ""
        if not text.strip():
            return None

        title_match = re.search(r"^Title:\s*(.+)$", text, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else ""
        price = _find_price_from_text(text)
        img_matches = re.findall(r"!\[[^\]]*\]\((https?://[^)]+)\)", text)
        images = []
        seen: set[str] = set()
        for img in img_matches:
            if img not in seen:
                seen.add(img)
                images.append(img)
            if len(images) >= 6:
                break

        if not title and not price and not images:
            return None
        normalized_title = (title or "").strip().lower()
        domain_like = bool(re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", normalized_title))
        bad_titles = {
            "privacy settings",
            "blocked page",
            "captcha interception",
            "access denied",
            "page not found",
            "not found",
        }
        if (
            (normalized_title in bad_titles or domain_like or normalized_title.startswith("url source:"))
            and not price
            and len(images) < 2
        ):
            return None

        return ProductData(
            title=title or "Unknown Product",
            price_jpy=parse_jpy(price),
            price_display=price,
            images=images,
            description=text[:600] if text else None,
            marketplace=_domain(url),
            url=url,
            confidence="low",
            scrape_reason_code="CRAWL4AI",
        )
    except Exception:
        return None
