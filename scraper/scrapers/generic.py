"""
Generic scraper using Crawl4AI for unknown / dynamic URLs.
Falls back to httpx + BeautifulSoup if Crawl4AI is not available.
"""
from __future__ import annotations

import re

import httpx
from bs4 import BeautifulSoup

from .models import BROWSER_HEADERS, ProductData, parse_jpy


async def scrape_generic(url: str) -> ProductData:
    try:
        return await _crawl4ai(url)
    except Exception:
        return await _bs4_fallback(url)


async def _crawl4ai(url: str) -> ProductData:
    from crawl4ai import AsyncWebCrawler  # type: ignore

    async with AsyncWebCrawler(verbose=False) as crawler:
        result = await crawler.arun(url=url, bypass_cache=True)

    content: str = getattr(result, "markdown", "") or ""
    meta: dict = getattr(result, "metadata", {}) or {}
    media: dict = getattr(result, "media", {}) or {}

    title = meta.get("title") or _heading(content) or "Unknown Product"
    price_match = re.search(r"[¥￥]\s*[\d,]+|[\d,]+\s*円", content)
    price_text = price_match.group(0) if price_match else ""

    images: list[str] = [
        img["src"]
        for img in (media.get("images") or [])
        if isinstance(img, dict) and img.get("src", "").startswith("http")
    ][:6]

    return ProductData(
        title=title.strip(),
        price_jpy=parse_jpy(price_text),
        price_display=price_text,
        images=images,
        description=content[:600] if content else None,
        marketplace=_domain(url),
        url=url,
        confidence="medium" if title and images else "low",
        scrape_reason_code="CRAWL4AI",
    )


async def _bs4_fallback(url: str) -> ProductData:
    async with httpx.AsyncClient(
        headers=BROWSER_HEADERS, follow_redirects=True, timeout=20
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    title_el = soup.select_one("h1") or soup.find("title")
    title = title_el.get_text(strip=True) if title_el else "Unknown Product"

    price_text = ""
    for el in soup.find_all(string=re.compile(r"[¥￥]\s*[\d,]+")):
        price_text = el.strip()
        break

    images: list[str] = [
        img["src"]
        for img in soup.select("img[src]")
        if img["src"].startswith("http")
    ][:6]

    desc_el = soup.select_one("meta[name='description']")
    description = desc_el.get("content", "") if desc_el else ""

    return ProductData(
        title=title[:200],
        price_jpy=parse_jpy(price_text),
        price_display=price_text,
        images=images,
        description=description[:600] or None,
        marketplace=_domain(url),
        url=url,
        confidence="low",
        scrape_reason_code="PARSE_EMPTY" if not price_text else "PLAYWRIGHT",
    )


def _heading(markdown: str) -> str:
    m = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    return m.group(1).strip() if m else ""


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/]+)", url)
    return m.group(1) if m else "generic"
