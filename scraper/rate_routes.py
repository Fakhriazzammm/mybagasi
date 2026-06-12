"""
Live JPY exchange rate + shipping rates table for MyBagasi.
- /rate/jpy — Live JPY→IDR rate with 3-tier fallback
- /rate/shipping — Shipping cost per category
- /rate/calculate — Full price breakdown
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Query

router = APIRouter(prefix="/rate")

# ── Shipping rates table ──────────────────────────────────

SHIPPING_RATES: dict[str, dict[str, Any]] = {
    "skincare": {"base_kg": 0.3, "price_per_kg": 350000, "note": "Kosmetik/cairan"},
    "fashion": {"base_kg": 0.5, "price_per_kg": 250000, "note": "Pakaian, sepatu"},
    "elektronik": {"base_kg": 0.5, "price_per_kg": 300000, "note": "Elektronik kecil"},
    "buku": {"base_kg": 0.3, "price_per_kg": 200000, "note": "Buku/majalah"},
    "food": {"base_kg": 0.5, "price_per_kg": 300000, "note": "Makanan/minuman"},
    "general": {"base_kg": 0.5, "price_per_kg": 250000, "note": "Lainnya"},
}

# ── Constants ──────────────────────────────────────────────

ADMIN_FEE = 25000  # Rp25.000 flat admin fee (optional, can be 0)
JASA_PERSEN = 0.10  # 10% jasa fee (default, configurable from DB)
PAJAK_PERSEN = 0.11  # Pajak 11%
HARDCODED_JPY_RATE = 105  # Last-resort fallback

JPY_API_URL = "https://api.exchangerate-api.com/v4/latest/JPY"
GOOGLE_FINANCE_URL = "https://www.google.com/finance/quote/JPY-IDR"

# In-memory cache for JPY rate
_jpy_cache: dict[str, Any] = {"rate": None, "source": None, "updated_at": None}


# ── Helpers ────────────────────────────────────────────────


async def _fetch_from_exchangerate_api() -> tuple[float, str] | None:
    """Try exchangerate-api.com (free, no key). Returns (rate, source)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(JPY_API_URL)
        if resp.is_success:
            data = resp.json()
            rates = data.get("rates", {})
            # exchangerate-api returns base=JPY, so rates.IDR is the rate
            idr_rate = rates.get("IDR")
            if idr_rate and isinstance(idr_rate, (int, float)):
                return float(idr_rate), "exchangerate-api.com"
    except Exception:
        pass
    return None


async def _fetch_from_google_finance() -> tuple[float, str] | None:
    """Fallback: scrape Google Finance JPY-IDR quote."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                GOOGLE_FINANCE_URL,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                },
            )
        if resp.is_success:
            html = resp.text
            # Google Finance shows the rate in a data-last-price attribute or
            # inside a div with class "YMlKec"
            patterns = [
                r'data-last-price="([\d,.]+)"',
                r'class="YMlKec[^"]*">([\d,.]+)',
                r'class="[\w\s]*?YMlKec[\w\s]*?">([\d,.]+)',
            ]
            for pat in patterns:
                m = re.search(pat, html)
                if m:
                    raw = m.group(1).replace(",", "")
                    try:
                        rate = float(raw)
                        if rate > 0:
                            return rate, "google-finance"
                    except ValueError:
                        pass
    except Exception:
        pass
    return None


async def _get_jpy_rate(force_refresh: bool = False) -> dict[str, Any]:
    """Get live JPY→IDR rate with 3-tier fallback + cache."""
    now = datetime.now(timezone.utc)

    # Use cache if it's less than 5 minutes old
    if not force_refresh and _jpy_cache["rate"] is not None and _jpy_cache["updated_at"] is not None:
        age = (now - _jpy_cache["updated_at"]).total_seconds()
        if age < 300:  # 5 min cache
            return {
                "rate": _jpy_cache["rate"],
                "source": _jpy_cache["source"],
                "updated_at": _jpy_cache["updated_at"].isoformat(),
            }

    rate: float | None = None
    source: str | None = None

    # Tier 1: exchangerate-api.com
    result = await _fetch_from_exchangerate_api()
    if result:
        rate, source = result

    # Tier 2: Google Finance
    if rate is None:
        result = await _fetch_from_google_finance()
        if result:
            rate, source = result

    # Tier 3: hardcoded fallback
    if rate is None:
        rate = HARDCODED_JPY_RATE
        source = "hardcoded"

    # Update cache
    _jpy_cache["rate"] = rate
    _jpy_cache["source"] = source
    _jpy_cache["updated_at"] = now

    return {
        "rate": rate,
        "source": source,
        "updated_at": now.isoformat(),
    }


def _calc_shipping_cost(category: str) -> dict[str, Any]:
    """Calculate shipping cost based on category rules."""
    cat_data = SHIPPING_RATES.get(category, SHIPPING_RATES["general"])
    base_kg = cat_data["base_kg"]
    price_per_kg = cat_data["price_per_kg"]
    # Minimum shipping = base_kg * price_per_kg
    cost = int(base_kg * price_per_kg)
    return {
        "category": category,
        "note": cat_data["note"],
        "base_kg": base_kg,
        "price_per_kg": price_per_kg,
        "shipping_cost_idr": cost,
    }


# ── Endpoints ──────────────────────────────────────────────


@router.get("/jpy")
async def rate_jpy(refresh: bool = Query(False, description="Force refresh from source")):
    """Live JPY→IDR exchange rate with 3-tier fallback.

    Tier 1: exchangerate-api.com (free, no key)
    Tier 2: Google Finance scrape
    Tier 3: hardcoded 105
    """
    result = await _get_jpy_rate(force_refresh=refresh)
    return {
        "success": True,
        "rate": result["rate"],
        "source": result["source"],
        "updated_at": result["updated_at"],
    }


@router.get("/shipping")
async def rate_shipping(category: str | None = Query(None)):
    """Shipping rates per category.

    - ?category=fashion — single category
    - no param — all categories
    """
    if category:
        cat = category.lower().strip()
        if cat not in SHIPPING_RATES:
            return {
                "success": False,
                "error": f"Kategori '{category}' tidak ditemukan. Pilihan: {', '.join(SHIPPING_RATES.keys())}",
            }
        return {
            "success": True,
            "data": _calc_shipping_cost(cat),
        }

    return {
        "success": True,
        "data": [
            _calc_shipping_cost(cat)
            for cat in SHIPPING_RATES
        ],
    }


@router.get("/calculate")
async def rate_calculate(
    price_jpy: float = Query(..., description="Harga barang dalam JPY"),
    category: str = Query("general", description="Kategori barang"),
    quantity: int = Query(1, ge=1, description="Jumlah barang"),
):
    """Full price breakdown from JPY price to final IDR total.

    Calculation:
      - price_idr  = price_jpy * rate_jpy
      - jasa       = price_idr * 10%
      - ongkir     = shipping cost per category
      - pajak      = (price_idr + jasa) * 11%
      - total_idr  = price_idr + jasa + ongkir + pajak
      - total_jpy  = total_idr / rate_jpy
    """
    rate_data = await _get_jpy_rate()
    rate = rate_data["rate"]

    price_idr = round(price_jpy * rate * quantity)
    jasa = round(price_idr * JASA_PERSEN)
    ongkir_info = _calc_shipping_cost(category)
    ongkir = ongkir_info["shipping_cost_idr"]
    pajak = round((price_idr + jasa) * PAJAK_PERSEN)
    total_idr = price_idr + jasa + ongkir + pajak
    total_jpy = round(total_idr / rate, 2) if rate > 0 else 0

    return {
        "success": True,
        "rate": rate,
        "rate_source": rate_data["source"],
        "breakdown": {
            "price_jpy": price_jpy,
            "quantity": quantity,
            "price_idr": price_idr,
            "jasa_10_persen": jasa,
            "ongkir": ongkir,
            "pajak": pajak,
            "total_idr": total_idr,
            "total_jpy": total_jpy,
            "shipping_category": ongkir_info["category"],
            "shipping_note": ongkir_info["note"],
        },
    }
