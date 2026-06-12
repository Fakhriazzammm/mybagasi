"""
LLM-based product extraction using DeepSeek direct API.
Falls back when BS4/Crawl4AI can't extract price/images from markdown.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from .models import ProductData, parse_jpy

log = logging.getLogger("mybagasi_llm")

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

PROMPT = """You are a product extractor for a Japanese shopping assistant.
Extract product information from the markdown content below.

Return a JSON object with these fields:
- "title": Product name (Japanese if available, otherwise English)
- "price_jpy": Price in Japanese Yen as integer (remove ¥ symbol and commas). If multiple prices, take the first/main one. If no price found, return null.
- "description": Short product description (max 200 chars)
- "available": true if the product appears to be in stock/available for purchase, false otherwise

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- If the page has no product info, return {{"title": null, "price_jpy": null}}
- Price must be in Yen only, not IDR or other currencies
- If you see "円" or "¥" or "yen", convert to integer

Page URL: {url}

Content:
{content}
"""


def _domain(url: str) -> str:
    from urllib.parse import urlparse
    hostname = urlparse(url).hostname or ""
    return hostname[4:] if hostname.startswith("www.") else (hostname or "generic")


async def llm_extract_product(url: str, markdown: str) -> ProductData | None:
    """Extract product info from markdown using DeepSeek API.
    Returns ProductData if successful, None if failed or no product found.
    """
    if not DEEPSEEK_API_KEY:
        log.warning("DEEPSEEK_API_KEY not configured, skipping LLM extraction")
        return None

    if not markdown or len(markdown.strip()) < 50:
        return None

    # Truncate content to avoid token limits
    content = markdown[:8000] if len(markdown) > 8000 else markdown

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You extract product data from web page content. Return only JSON."},
            {"role": "user", "content": PROMPT.format(url=url, content=content)},
        ],
        "temperature": 0.0,
        "max_tokens": 500,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        log.warning(f"LLM extract HTTP error for {url[:60]}: {e}")
        return None

    try:
        text = data["choices"][0]["message"]["content"]
        extracted = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        log.warning(f"LLM extract parse error for {url[:60]}: {e}")
        return None

    title = extracted.get("title")
    price_jpy = extracted.get("price_jpy")
    description = extracted.get("description", "")
    available = extracted.get("available", True)

    if not title and not price_jpy:
        return None  # No product found

    # Validate price
    if price_jpy is not None:
        try:
            price_jpy = int(float(str(price_jpy).replace(",", "")))
        except (ValueError, TypeError):
            price_jpy = None

    price_display = f"¥{price_jpy:,}" if price_jpy else ""

    return ProductData(
        title=(title or "Unknown Product")[:200],
        price_jpy=price_jpy,
        price_display=price_display,
        images=[],
        description=(description or "")[:500],
        marketplace=_domain(url),
        available=bool(available),
        url=url,
        confidence="medium",
        scrape_reason_code="LLM_EXTRACT",
    )
