from __future__ import annotations

import base64
import json
import os
import re
from typing import Any, Optional

import httpx
from playwright.async_api import async_playwright

from .models import ProductData, parse_jpy


def _api_key() -> str:
    return (
        os.getenv("SUMOPOD_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("VITE_SUMOPOD_API_KEY")
        or os.getenv("VITE_OPENAI_API_KEY")
        or ""
    )


def _base_url() -> str:
    return (
        os.getenv("OPENAI_BASE_URL")
        or os.getenv("VITE_OPENAI_BASE_URL")
        or "https://ai.sumopod.com/v1"
    ).rstrip("/")


def _safe_price_jpy(price_display: str) -> Optional[int]:
    text = (price_display or "").strip()
    lower = text.lower()
    if "¥" in text:
        m = re.search(r"¥\s*([\d,\.]+)", text)
        if m:
            return parse_jpy(m.group(1))
    if "jpy" in lower:
        m = re.search(r"jpy\s*([\d,\.]+)", lower)
        if m:
            return parse_jpy(m.group(1))
    if "円" in text:
        m = re.search(r"([\d,\.]+)\s*円", text)
        if m:
            return parse_jpy(m.group(1))
    if any(token in lower for token in ["¥", "jpy", "円"]):
        return parse_jpy(text)
    return None


def _parse_json_object(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def _capture_screenshot_bytes(url: str) -> Optional[bytes]:
    profiles = [
        {
            "viewport": {"width": 390, "height": 844},
            "user_agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
            "extra_http_headers": {"Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8"},
        },
        {
            "viewport": {"width": 1280, "height": 1800},
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "extra_http_headers": {"Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8"},
        },
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            for profile in profiles:
                context = await browser.new_context(**profile)
                try:
                    page = await context.new_page()
                    await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                    try:
                        await page.wait_for_load_state("networkidle", timeout=12_000)
                    except Exception:
                        pass
                    await page.wait_for_timeout(2500)
                    body_text = (await page.inner_text("body")).strip().lower()
                    shot = await page.screenshot(full_page=False, type="jpeg", quality=75)
                    if not _looks_like_skeleton_or_blank(body_text):
                        return shot
                except Exception:
                    continue
                finally:
                    await context.close()

            # Final fallback: screenshot text-mirror page that usually bypasses anti-bot.
            mirror_url = "https://r.jina.ai/http://" + url.replace("https://", "").replace("http://", "")
            context = await browser.new_context(
                viewport={"width": 1280, "height": 1800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            try:
                page = await context.new_page()
                await page.goto(mirror_url, wait_until="domcontentloaded", timeout=45_000)
                await page.wait_for_timeout(1200)
                return await page.screenshot(full_page=True, type="jpeg", quality=78)
            except Exception:
                return None
            finally:
                await context.close()
        finally:
            await browser.close()
    return None


def _looks_like_skeleton_or_blank(body_text: str) -> bool:
    text = (body_text or "").strip().lower()
    if len(text) < 80:
        return True
    skeleton_signals = [
        "会員登録",
        "ログイン",
        "loading",
        "読み込み",
    ]
    has_only_top_nav = all(token in text for token in ["mercari", "会員登録", "ログイン"]) and len(text) < 220
    return has_only_top_nav or any(sig in text for sig in skeleton_signals) and len(text) < 220


async def extract_product_via_screenshot_ai(
    url: str, marketplace: str
) -> Optional[ProductData]:
    api_key = _api_key()
    if not api_key:
        return None

    image_bytes = await _capture_screenshot_bytes(url)
    if not image_bytes:
        return None

    image_data_url = (
        "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
    )
    mirror_text = await _fetch_mirror_text(url)

    prompt = (
        "Analisis screenshot halaman ecommerce/marketplace berikut dan ekstrak data produk. "
        "Balas WAJIB dalam JSON object valid dengan keys:\n"
        "is_product_page (boolean), title (string), price_display (string), "
        "condition (string), seller (string), available (boolean), description (string), "
        "confidence (\"high\"|\"medium\"|\"low\").\n"
        "Jika bukan halaman produk, set is_product_page=false."
    )

    body = {
        "model": "gpt-4o-mini",
        "temperature": 0,
        "max_tokens": 500,
        "messages": [
            {"role": "system", "content": "Kamu adalah extractor data produk screenshot."},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "text",
                        "text": (
                            "Konteks teks mirror (gunakan sebagai sumber utama jika tersedia):\n"
                            + (mirror_text[:6000] if mirror_text else "(kosong)")
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                f"{_base_url()}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
    except Exception:
        return None

    payload = resp.json() if resp.content else {}
    content = (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed = _parse_json_object(content)
    if not parsed:
        return None

    is_product_page = bool(parsed.get("is_product_page", True))
    title = str(parsed.get("title") or "").strip()
    price_display = str(parsed.get("price_display") or "").strip()
    condition = str(parsed.get("condition") or "").strip() or None
    seller = str(parsed.get("seller") or "").strip() or None
    available = bool(parsed.get("available", True))
    description = str(parsed.get("description") or "").strip() or None
    confidence = str(parsed.get("confidence") or "low").strip().lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"

    if not is_product_page or not title:
        return None

    return ProductData(
        title=title,
        price_jpy=_safe_price_jpy(price_display),
        price_display=price_display,
        condition=condition,
        images=[],
        description=description,
        seller=seller,
        marketplace=marketplace or "generic",
        available=available,
        url=url,
        confidence=confidence,
        scrape_reason_code="SCREENSHOT_AI",
    )


async def _fetch_mirror_text(url: str) -> str:
    mirror_url = "https://r.jina.ai/http://" + url.replace("https://", "").replace("http://", "")
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(mirror_url)
            resp.raise_for_status()
        return (resp.text or "").strip()
    except Exception:
        return ""
