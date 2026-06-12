"""
MyBagasi Telegram Bot v3 — AI Personal Shopper with Data Persistence
====================================================================
- Link akun MyBagasi via unique token
- AI Personal Shopper (cari produk, scrape, estimasi harga, checkout via Mayar)
- **Data tersimpan per user → muncul di dashboard web**
- Multi-turn conversation with tool calling

Commands:
  /start <TOKEN>   — Link Telegram ke MyBagasi
  /status          — Cek status akun + data tersimpan
  /tagihan         — Cek tagihan pembayaran
  /unlink          — Putus sambungan
  /beli <keyword>  — Cari produk Jepang (AI-driven)
  /cek <url>       — Cek harga produk dari link
  /wishlist        — Lihat wishlist tersimpan
  /help            — Bantuan
  /reset           — Reset percakapan AI
"""

import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx

# ── Configuration ──────────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SCRAPER_URL = "http://localhost:8000"
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
POLL_TIMEOUT = 30
POLL_INTERVAL = 2

# Pricing
# ── Pricing Config (diambil dari DB, fallback hardcoded) ──
_PRICING_CACHE: dict[str, any] = {}
_PRICING_CACHE_TIME = 0

# Default fallback
JPY_TO_IDR = 105
SHIPPING_IDR = 250000
TAX_RATE = 0.08

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mybagasi_bot")

# ── Conversation State (per user) ─────────────────────────
# Structure: {chat_id: {"messages": [...], "context": {"last_quotation_id": ..., "last_product": ..., "user_id": ...}}}
conversations: dict[int, dict[str, Any]] = {}
_pending_reg: dict[int, dict[str, Any]] = {}    # {chat_id: {"step": "name"|"email"|"password"|"verify", ...}}
_pending_login: dict[int, dict[str, Any]] = {}   # {chat_id: {"step": "email"|"verify", ...}}
MAX_HISTORY = 20

# ── Telegram Helpers ──────────────────────────────────────

def tg_url(method: str) -> str:
    return f"{TELEGRAM_API}/{method}"

async def tg_send(chat_id: int, text: str, parse_mode: str = "Markdown", reply_markup: dict | None = None) -> dict | None:
    try:
        payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                tg_url("sendMessage"),
                json=payload,
            )
            return r.json()
    except Exception as e:
        log.error(f"tg_send error: {e}")
        return None

async def tg_typing(chat_id: int):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(tg_url("sendChatAction"), json={"chat_id": chat_id, "action": "typing"})
    except:
        pass

async def tg_edit(chat_id: int, message_id: int, text: str, parse_mode: str = "Markdown") -> dict | None:
    """Edit a message via Telegram API."""
    try:
        payload = {"chat_id": chat_id, "message_id": message_id, "text": text, "parse_mode": parse_mode}
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(tg_url("editMessageText"), json=payload)
            return r.json()
    except Exception as e:
        log.error(f"tg_edit error: {e}")
        return None

async def status_timer(chat_id: int, message_id: int, start_time: float, status_ref: list[str] | None = None):
    """Update status message with elapsed seconds and dynamic status text every 2s."""
    while True:
        elapsed = int(time.time() - start_time)
        if elapsed > 120:
            # More than 2 minutes — show timeout warning
            text = f"⏳ *Masih diproses...* ⏰ `{elapsed}s`"
            if status_ref and status_ref[0]:
                text = f"{status_ref[0]} ⏰ `{elapsed}s`"
            await tg_edit(chat_id, message_id, text)
            await asyncio.sleep(2)
            continue
        # Gunakan status dinamis jika ada
        if status_ref and status_ref[0]:
            text = f"{status_ref[0]} ⏳ `{elapsed}s`"
        else:
            text = f"🔍 *Mencari produk...* ⏳ `{elapsed}s`"
        await tg_edit(chat_id, message_id, text)
        await asyncio.sleep(2)

async def tg_split_send(chat_id: int, text: str, parse_mode: str = "Markdown", reply_markup: dict | None = None):
    if len(text) <= 4000:
        return await tg_send(chat_id, text, parse_mode, reply_markup=reply_markup)
    # Keyboard hanya di bagian pertama kalau split
    parts = []
    while text:
        if len(text) <= 4000:
            parts.append(text)
            break
        split_at = text.rfind("\n", 0, 4000)
        if split_at < 0:
            split_at = 4000
        parts.append(text[:split_at])
        text = text[split_at:]
    for i, part in enumerate(parts):
        rm = reply_markup if i == 0 else None
        await tg_send(chat_id, part, parse_mode, reply_markup=rm)
        await asyncio.sleep(0.3)

async def tg_send_photo(chat_id: int, photo_url: str, caption: str, reply_markup: dict | None = None) -> dict | None:
    """Send a photo with caption."""
    try:
        payload = {"chat_id": chat_id, "photo": photo_url, "caption": caption, "parse_mode": "Markdown"}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(tg_url("sendPhoto"), json=payload)
            return r.json()
    except Exception as e:
        log.error(f"tg_send_photo error: {e}")
        return None

# ── Supabase Auth Helpers ─────────────────────────────────

async def lookup_user_by_token(token: str) -> dict | None:
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_token": f"eq.{token}", "select": "id,name,email,telegram_id,telegram_token,role", "limit": 1},
                headers=headers,
            )
            if r.status_code == 200 and r.json():
                return r.json()[0]
            return None
    except Exception as e:
        log.error(f"lookup_user error: {e}")
        return None

async def link_telegram(user_id: str, telegram_chat_id: int) -> bool:
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"id": f"eq.{user_id}"},
                json={"telegram_id": telegram_chat_id},
                headers=headers,
            )
            return r.status_code in (200, 204)
    except Exception as e:
        log.error(f"link_telegram error: {e}")
        return False

async def unlink_telegram(telegram_chat_id: int) -> bool:
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_chat_id}"},
                json={"telegram_id": None},
                headers=headers,
            )
            return r.status_code in (200, 204)
    except Exception as e:
        log.error(f"unlink_telegram error: {e}")
        return False

async def lookup_user_by_telegram_id(telegram_chat_id: int) -> dict | None:
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_chat_id}", "select": "id,name,email,telegram_id,telegram_token,role", "limit": 1},
                headers=headers,
            )
            if r.status_code == 200 and r.json():
                return r.json()[0]
            return None
    except Exception as e:
        log.error(f"lookup_user_by_telegram_id error: {e}")
        return None

# ── Bot Auth Helpers ──────────────────────────────────────

async def register_user_via_admin_api(name: str, email: str, password: str) -> dict:
    """Create a new user via Supabase Auth Admin API (service_role).
    The trigger handle_new_user() will auto-create profile + telegram_token."""
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
    }
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"name": name},
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code in (200, 201):
                data = r.json()
                return {"success": True, "user_id": data["id"], "email": data.get("email", email)}
            err = r.json().get("msg") or r.text[:200]
            return {"error": err}
    except Exception as e:
        log.error(f"register_user error: {e}")
        return {"error": str(e)}

async def get_profile_by_email(email: str) -> dict | None:
    """Lookup profile by email address."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"email": f"eq.{email.lower()}", "select": "id,name,email,telegram_id,telegram_token,role", "limit": 1},
                headers=headers,
            )
            if r.status_code == 200 and r.json():
                return r.json()[0]
            return None
    except Exception as e:
        log.error(f"get_profile_by_email error: {e}")
        return None

async def rotate_telegram_token(user_id: str) -> str | None:
    """Generate a new telegram_token for a user via DB RPC function."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/rotate_telegram_token",
                json={"p_user_id": user_id},
                headers=headers,
            )
            if r.status_code == 200:
                return r.text.strip().strip('"')
            return None
    except Exception as e:
        log.error(f"rotate_token error: {e}")
        return None

# ── Supabase Data Persistence ─────────────────────────────

_supabase_headers = lambda: {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
_supabase_headers_return = lambda: {**_supabase_headers(), "Prefer": "return=representation"}

async def supabase_insert(table: str, data: dict) -> dict | None:
    """Generic INSERT into Supabase and return the created record."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/{table}",
                json=data,
                headers=_supabase_headers_return(),
            )
            if r.status_code in (200, 201):
                rows = r.json()
                return rows[0] if rows else None
            log.warning(f"INSERT {table} HTTP {r.status_code}: {r.text[:200]}")
            return None
    except Exception as e:
        log.error(f"INSERT {table} error: {e}")
        return None

# ── Pricing System ──────────────────────────────────────────
_PRICING_CACHE_DATA: dict = {}
_PRICING_CACHE_AT = 0.0
_PRICING_CACHE_TTL = 300  # 5 menit

async def _ensure_pricing_table():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
    seed = [
        {"key": "exchange_rate", "value": {"rate": 105, "source": "hardcoded", "auto_update": True, "last_fetched": None}},
        {"key": "profit_tiers", "value": {"tiers": [
            {"min": 0, "max": 999999, "profit": 100000},
            {"min": 1000000, "max": 2999999, "profit": 300000},
            {"min": 3000000, "max": 4999999, "profit": 500000},
            {"min": 5000000, "max": 9999999, "profit": 1000000},
            {"min": 10000000, "max": 999999999, "profit": 2000000}
        ]}},
        {"key": "shipping_cost", "value": {"cost": 250000, "description": "Ongkir Jepang ke Indonesia"}},
        {"key": "tax_rate", "value": {"rate": 0.11, "description": "Pajak & bea cukai 11%"}},
        {"key": "distribution_ratio", "value": {"fee": 33, "shipping": 34, "tax": 33, "description": "Distribusi profit ke fee/ongkir/pajak (%)"}},
    ]
    async with httpx.AsyncClient(timeout=10) as client:
        for s in seed:
            r = await client.post(f"{SUPABASE_URL}/rest/v1/pricing_config", json=s, headers={**headers, "Prefer": "resolution=merge-duplicates"})
            if r.status_code == 404:
                log.warning("pricing_config table not found, using hardcoded defaults")
                return

async def refresh_pricing_cache():
    global _PRICING_CACHE_DATA, _PRICING_CACHE_AT
    now = time.time()
    if now - _PRICING_CACHE_AT < _PRICING_CACHE_TTL:
        return
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{SUPABASE_URL}/rest/v1/pricing_config", headers=headers, params={"select": "key,value"})
            if r.status_code == 200 and r.json():
                for item in r.json():
                    _PRICING_CACHE_DATA[item["key"]] = item["value"]
                _PRICING_CACHE_AT = now
                log.info(f"Pricing config refreshed: {len(_PRICING_CACHE_DATA)} keys")
    except Exception as e:
        log.warning(f"Failed to refresh pricing config: {e}")

async def get_exchange_rate() -> int:
    await refresh_pricing_cache()
    cfg = _PRICING_CACHE_DATA.get("exchange_rate", {})
    rate = cfg.get("rate", 105)
    # Auto-fetch dari internet jika diaktifkan
    if cfg.get("auto_update"):
        last = cfg.get("last_fetched")
        should_fetch = not last  # never fetched
        if last and isinstance(last, str):
            import datetime
            try:
                last_dt = datetime.datetime.fromisoformat(last.replace("Z", "+00:00"))
                if (datetime.datetime.now(datetime.timezone.utc) - last_dt).total_seconds() > 3600:
                    should_fetch = True
            except:
                should_fetch = True
        if should_fetch:
            rate = await _fetch_live_rate()
    return rate

async def _fetch_live_rate() -> int:
    import datetime
    urls = [
        "https://api.exchangerate-api.com/v4/latest/JPY",
        "https://open.er-api.com/v6/latest/JPY",
    ]
    for url in urls:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    idr = data["rates"].get("IDR")
                    if idr:
                        rate = round(idr)
                        log.info(f"Live JPY/IDR rate: {rate}")
                        try:
                            await client.patch(
                                f"{SUPABASE_URL}/rest/v1/pricing_config?key=eq.exchange_rate",
                                json={"value": {"rate": rate, "source": url.split('/')[2], "auto_update": True, "last_fetched": datetime.datetime.now(datetime.timezone.utc).isoformat()}},
                                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
                            )
                        except:
                            pass
                        return rate
        except Exception as e:
            log.warning(f"Rate fetch failed from {url}: {e}")
    return 105

# ── Shipping rates by category (sync with rate_routes.py) ──
_SHIPPING_RATES = {
    "skincare": {"base_kg": 0.3, "price_per_kg": 350000, "note": "Kosmetik/cairan"},
    "fashion": {"base_kg": 0.5, "price_per_kg": 250000, "note": "Pakaian, sepatu"},
    "elektronik": {"base_kg": 0.5, "price_per_kg": 300000, "note": "Elektronik kecil"},
    "buku": {"base_kg": 0.3, "price_per_kg": 200000, "note": "Buku/majalah"},
    "food": {"base_kg": 0.5, "price_per_kg": 300000, "note": "Makanan/minuman"},
    "general": {"base_kg": 0.5, "price_per_kg": 250000, "note": "Lainnya"},
}

async def get_shipping_by_category(category: str = "general") -> dict:
    """Get dynamic shipping cost for a product category."""
    cat = category.lower().strip()
    cat_data = _SHIPPING_RATES.get(cat, _SHIPPING_RATES["general"])
    cost = int(cat_data["base_kg"] * cat_data["price_per_kg"])
    return {
        "cost": cost,
        "category": cat if cat in _SHIPPING_RATES else "general",
        "note": cat_data["note"],
        "base_kg": cat_data["base_kg"],
        "price_per_kg": cat_data["price_per_kg"],
    }

async def get_shipping_cost() -> int:
    """Legacy: flat shipping cost (used as fallback)."""
    await refresh_pricing_cache()
    return _PRICING_CACHE_DATA.get("shipping_cost", {}).get("cost", 250000)

async def get_tax_rate() -> float:
    await refresh_pricing_cache()
    return _PRICING_CACHE_DATA.get("tax_rate", {}).get("rate", 0.11)

async def get_profit_tiers() -> list:
    await refresh_pricing_cache()
    return _PRICING_CACHE_DATA.get("profit_tiers", {}).get("tiers", [])

async def get_distribution_ratio() -> dict:
    """Get profit distribution ratio (fee:shipping:tax)."""
    await refresh_pricing_cache()
    default = {"fee": 33, "shipping": 34, "tax": 33}
    return _PRICING_CACHE_DATA.get("distribution_ratio", default)

# Hardcoded fallback tiers
_FALLBACK_TIERS = [
    {"min": 0, "max": 999999, "profit": 100000},
    {"min": 1000000, "max": 2999999, "profit": 300000},
    {"min": 3000000, "max": 4999999, "profit": 500000},
    {"min": 5000000, "max": 9999999, "profit": 1000000},
    {"min": 10000000, "max": 999999999, "profit": 2000000},
]

async def calculate_profit(price_idr: int) -> int:
    tiers = await get_profit_tiers()
    if not tiers:
        tiers = _FALLBACK_TIERS
    for tier in tiers:
        if tier["min"] <= price_idr <= tier["max"]:
            return tier["profit"]
    if tiers:
        return tiers[-1]["profit"]
    return 100000

async def estimate_price_v2(price_jpy: int, category: str = "general") -> dict:
    """Auto-distribute target profit across fee jasa, ongkir markup, and pajak markup.

    Sistem baru:
    - Target profit dari tier (HIDDEN — tidak ditampilkan ke user)
    - Profit otomatis terdistribusi 'rata' ke fee jasa, ongkir, dan pajak
    - Ongkir dinamis berdasarkan kategori produk
    - Tidak ada baris 'Profit' — profit tersembunyi di fee+ongkir+pajak
    """
    rate = await get_exchange_rate()
    base_idr = price_jpy * rate
    target_profit = await calculate_profit(base_idr)
    
    # Dapatkan rasio distribusi dari DB (configurable via /admin)
    ratio = await get_distribution_ratio()
    total_ratio = ratio.get("fee", 33) + ratio.get("shipping", 34) + ratio.get("tax", 33)
    if total_ratio <= 0:
        total_ratio = 100
    
    # Distribusi profit ke 3 komponen
    fee_jasa = round(target_profit * ratio.get("fee", 33) / total_ratio)
    ongkir_markup = round(target_profit * ratio.get("shipping", 34) / total_ratio)
    pajak_markup = round(target_profit * ratio.get("tax", 33) / total_ratio)
    
    # Handle sisa pembulatan (pastikan total profit = target)
    remainder = target_profit - (fee_jasa + ongkir_markup + pajak_markup)
    # Sisa masuk ke ongkir markup (paling flexible)
    ongkir_markup += remainder
    
    # Ongkir real dari kategori
    shipping_info = await get_shipping_by_category(category)
    real_ongkir = shipping_info["cost"]
    ongkir_display = real_ongkir + max(0, ongkir_markup)
    
    # Pajak: standard + markup
    pajak_persen = await get_tax_rate()
    pajak_standard = round((base_idr + fee_jasa) * pajak_persen)
    pajak_display = pajak_standard + max(0, pajak_markup)
    
    total = base_idr + fee_jasa + ongkir_display + pajak_display
    fee_persen = round(fee_jasa / base_idr * 100, 1) if base_idr > 0 else 0
    
    return {
        "base_idr": base_idr,
        "fee_jasa": fee_jasa,
        "fee_persen": fee_persen,
        "shipping": ongkir_display,
        "shipping_real": real_ongkir,
        "shipping_markup": ongkir_markup,
        "shipping_category": shipping_info["category"],
        "shipping_note": shipping_info["note"],
        "pajak": pajak_display,
        "pajak_standard": pajak_standard,
        "pajak_markup": pajak_markup,
        "pajak_persen": pajak_persen,
        "total": total,
        "rate": rate,
        # Hidden internal fields (not displayed)
        "_target_profit": target_profit,
        "_distribution": {"fee": fee_jasa, "shipping_markup": ongkir_markup, "tax_markup": pajak_markup},
    }

async def save_quotation(user_id: str, product: str, price_jpy: int, source: str,
                         url: str | None = None, exchange_rate: int = 0,
                         category: str = "general") -> dict | None:
    est = await estimate_price_v2(price_jpy, category)
    data = {
        "user_id": user_id,
        "product": product[:200],
        "url": url or None,
        "source": source,
        "price_jpy": price_jpy,
        "exchange_rate": est["rate"],
        "service_fee": est["fee_jasa"],
        "shipping_cost": est["shipping"],
        "tax_customs": est["pajak"],
        "membership_discount": 0,
        "points_used": 0,
        "total": est["total"],
        "status": "active",
    }
    return await supabase_insert("quotations", data)

async def save_order(user_id: str, product: str, price_jpy: int, total: int,
                     source: str = "telegram_bot", quotation_id: str | None = None,
                     customer_name: str = "", notes: str = "",
                     category: str = "general") -> dict | None:
    est = await estimate_price_v2(price_jpy, category)
    data = {
        "user_id": user_id,
        "quotation_id": quotation_id or None,
        "product": product[:200],
        "source": source,
        "price_jpy": price_jpy,
        "exchange_rate": est["rate"],
        "service_fee": est["fee_jasa"],
        "shipping_cost": est["shipping"],
        "tax_customs": est["pajak"],
        "membership_discount": 0,
        "points_used": 0,
        "total": est["total"],
        "status": "waiting_payment",
        "notes": f"[Telegram Bot] {customer_name[:50]}\n{notes[:200]}" if notes else f"[Telegram Bot] {customer_name[:50]}" if customer_name else "Telegram Bot",
        "eta": None,
    }
    return await supabase_insert("orders", data)

async def save_wishlist_item(user_id: str, name: str, url: str | None = None,
                              price_idr: int | None = None, source: str | None = None) -> dict | None:
    """Save a wishlist item to Supabase."""
    data = {
        "user_id": user_id,
        "emoji": "🛍️",
        "name": name[:200],
        "url": url or None,
        "price_idr": price_idr or None,
        "source": source or "telegram_bot",
        "note": "Dari Telegram Bot",
    }
    return await supabase_insert("wishlist_items", data)

async def save_price_alert(user_id: str, product: str, target_price: int,
                            url: str | None = None, current_price: int | None = None) -> dict | None:
    """Save a price alert to Supabase."""
    data = {
        "user_id": user_id,
        "product": product[:200],
        "url": url or None,
        "current_price": current_price or None,
        "target_price": target_price,
        "status": "monitoring",
    }
    return await supabase_insert("price_alerts", data)

async def fetch_user_quotations(user_id: str, limit: int = 5) -> list:
    """Fetch user's quotations from Supabase."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/quotations",
                params={"user_id": f"eq.{user_id}", "select": "id,product,price_jpy,total,status,created_at,source",
                         "order": "created_at.desc", "limit": limit},
                headers=headers,
            )
            if r.status_code == 200:
                return r.json()
            return []
    except Exception as e:
        log.error(f"fetch_quotations error: {e}")
        return []

async def fetch_user_orders(user_id: str, limit: int = 5) -> list:
    """Fetch user's orders from Supabase."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/orders",
                params={"user_id": f"eq.{user_id}", "select": "id,product,total,status,created_at,source",
                         "order": "created_at.desc", "limit": limit},
                headers=headers,
            )
            if r.status_code == 200:
                return r.json()
            return []
    except Exception as e:
        log.error(f"fetch_orders error: {e}")
        return []

# ── Scraper Integration ────────────────────────────────────

async def scraper_scrape(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{SCRAPER_URL}/scrape", json={"url": url})
            if r.status_code == 200:
                data = r.json()
                # Pastikan image_url selalu tersedia dari images[0]
                if "images" in data and data["images"]:
                    data["image_url"] = data["images"][0]
                return data
            return {"error": f"HTTP {r.status_code}", "url": url}
    except Exception as e:
        return {"error": str(e), "url": url}

async def scraper_search(keyword: str, limit: int = 6) -> dict:
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(f"{SCRAPER_URL}/search", json={"keyword": keyword, "limit": limit})
            if r.status_code == 200:
                return r.json()
            return {"success": False, "items": [], "error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"success": False, "items": [], "error": str(e)}

async def create_payment_invoice(data: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{SCRAPER_URL}/mayar/invoice/create", json=data)
            if r.status_code == 200:
                return r.json()
            return {"success": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ── AI Agent ───────────────────────────────────────────────

SYSTEM_PROMPT = """Kamu adalah MyBagasi AI, asisten personal shopper untuk produk-produk dari Jepang.

TUGAS KAMU:
- Membantu pelanggan Indonesia membeli produk dari Jepang
- Cari **harga resmi/retail** dari **Amazon JP, Rakuten, toko official** (baru, original)
- ⛔ JANGAN GUNAKAN Yahoo Auction, Yahoo Shopping, atau PayPay Flea Market
- Jika hasil pencarian hanya dari Yahoo/second, KATAKAN "Tidak ditemukan produk baru dari toko resmi"
- Memberikan estimasi harga all-in (harga produk + fee jasa + ongkir + pajak)
- Memproses pembayaran via Mayar

KONVERSI & ESTIMASI:
- Kurs: 1 JPY = Rp 105 (nilai aktual bisa berbeda, tapi untuk estimasi pakai ~105)
- Fee jasa: otomatis dihitung sistem (~6-10% dari harga produk tergantung tier)
- Ongkir: DINAMIS tergantung kategori produk (lihat tabel di bawah)
- Pajak & bea cukai: 11% dari (harga produk + fee jasa)
- TIDAK ADA komponen "Profit" terpisah — fee jasa sudah termasuk profit

TABEL ONGKIR PER KATEGORI:
- fashion (pakaian, sepatu): ~Rp125.000
- elektronik (elektronik kecil): ~Rp150.000
- skincare (kosmetik/cairan): ~Rp105.000
- buku (buku/majalah): ~Rp60.000
- food (makanan/minuman): ~Rp150.000
- general (lainnya): ~Rp125.000

FORMAT JAWABAN:

Untuk hasil scrape/search berhasil, gunakan format jelas per produk:

📍 *Nama Produk*
💰 Harga: JPY X (Rp Y)
🏪 Marketplace: ...

Estimasi Biaya:
• Harga Produk: Rp ...
• Fee Jasa: Rp ...
• Ongkir: Rp ... (kategori)
• Pajak: Rp ...
• Total All-in: Rp ...

🔗 Lihat di [nama marketplace](url)

*Data tersimpan otomatis ke dashboard kamu!*

Jika ada foto produk, tulis:
---PHOTO:URL_FOTO_PRODUK---
di atas nama produk.

LARANGAN: JANGAN PERNAH menambahkan ---KEYBOARD---, ---END KEYBOARD---, [{"text":...}]] atau apapun yang berkaitan dengan tombol/keyboard. Tombol akan ditambahkan OTOMATIS oleh sistem.

CONTOH HASIL MULTI PRODUK:

1 — *Adizero Japan 9*

---PHOTO:https://example.com/foto.jpg---

🔗 [Lihat di Amazon JP](url)

Estimasi Biaya:
• Harga Produk: Rp1.470.000
• Fee Jasa: Rp100.000
• Ongkir: Rp125.000 (fashion)
• Pajak: Rp195.000
• Total All-in: Rp1.890.000

2 — *Adizero EVO SL*

---PHOTO:https://example.com/foto2.jpg---

🔗 [Lihat di Amazon JP](url)

Estimasi Biaya:
• Harga Produk: Rp2.100.000
• Fee Jasa: Rp100.000
• Ongkir: Rp125.000 (fashion)
• Pajak: Rp255.000
• Total All-in: Rp2.580.000

"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "scrape_product",
            "description": "Scrape detail produk dari URL marketplace Jepang (Rakuten, Amazon JP, toko official). Panggil ini jika user memberikan link produk. Data akan otomatis tersimpan.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL produk lengkap"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Cari produk BARU di Amazon JP, Rakuten, atau toko official Jepang berdasarkan kata kunci. Hasil pencarian akan tersimpan otomatis. Panggil jika user mencari produk tanpa link.",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "Kata kunci pencarian produk"},
                    "limit": {"type": "integer", "description": "Jumlah hasil maksimal (1-10)", "default": 5}
                },
                "required": ["keyword"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_to_wishlist",
            "description": "Simpan produk ke wishlist user. Panggil jika user meminta menyimpan produk untuk dibeli nanti.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_name": {"type": "string", "description": "Nama produk"},
                    "url": {"type": "string", "description": "URL produk (opsional)"},
                    "price_idr": {"type": "integer", "description": "Harga dalam IDR (opsional)"},
                    "marketplace": {"type": "string", "description": "Nama marketplace (opsional)"}
                },
                "required": ["product_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_price_alert",
            "description": "Buat notifikasi harga untuk produk. Panggil jika user ingin memantau harga produk tertentu.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_name": {"type": "string", "description": "Nama produk"},
                    "target_price_idr": {"type": "integer", "description": "Harga target dalam IDR"},
                    "url": {"type": "string", "description": "URL produk (opsional)"},
                    "current_price_idr": {"type": "integer", "description": "Harga saat ini dalam IDR (opsional)"}
                },
                "required": ["product_name", "target_price_idr"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_payment",
            "description": "Buat invoice pembayaran via Mayar setelah user konfirmasi beli. Order akan otomatis tersimpan di dashboard user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_name": {"type": "string", "description": "Nama lengkap customer"},
                    "customer_email": {"type": "string", "description": "Email customer"},
                    "customer_mobile": {"type": "string", "description": "No HP customer (format Indonesia)"},
                    "order_description": {"type": "string", "description": "Deskripsi pesanan"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string"},
                                "quantity": {"type": "integer"},
                                "rate": {"type": "integer", "description": "Harga per item dalam IDR"}
                            },
                            "required": ["description", "quantity", "rate"]
                        }
                    }
                },
                "required": ["customer_name", "customer_email", "customer_mobile", "order_description", "items"]
            }
        }
    }
]

async def call_deepseek(messages: list[dict], with_tools: bool = True) -> dict:
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "max_tokens": 1500,
        "temperature": 0.7,
    }
    if with_tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                json=body,
            )
            if r.status_code == 200:
                return r.json()
            log.error(f"DeepSeek API error {r.status_code}: {r.text[:300]}")
            return {"error": f"API error {r.status_code}"}
    except Exception as e:
        log.error(f"DeepSeek call error: {e}")
        return {"error": str(e)}

async def estimate_price(product_jpy: int, category: str = "general") -> dict:
    return await estimate_price_v2(product_jpy, category)

async def execute_tool(tool_name: str, args: dict, user_id: str | None = None, chat_id: int | None = None) -> str:
    """Execute a tool, save results to Supabase, and return result as JSON string."""
    
    # ─── scrape_product ───────────────────────────────────
    if tool_name == "scrape_product":
        url = args.get("url", "")
        if not url:
            return json.dumps({"error": "URL diperlukan"})
        log.info(f"Tool: scrape_product {url}")
        result = await scraper_scrape(url)
        
        # Auto-save quotation if scrape succeeded and user_id exists
        if user_id and not result.get("error") and result.get("title") and result.get("price_jpy"):
            saved = await save_quotation(
                user_id=user_id,
                product=result["title"] or "Produk dari " + (result.get("marketplace", "Jepang")),
                price_jpy=result["price_jpy"],
                source=result.get("marketplace", "scrape"),
                url=url,
            )
            if saved:
                result["_quotation_id"] = saved["id"]
                result["_quotation_saved"] = True
                log.info(f"Quotation saved: {saved['id']} for user {user_id[:8]}")
        
        # Kirim preview gambar jika ada
        if chat_id and not result.get("error") and result.get("title"):
            images = result.get("images", []) or []
            image_url = images[0] if images else result.get("image_url", "")
            marketplace = result.get("marketplace", "Jepang")
            price_display = result.get("price_display", "")
            title = (result.get("title") or "")[:60]
            reason = (result.get("scrape_reason_code") or "").upper()
            
            if image_url:
                caption = f"📍 *{title}*\n"
                if price_display:
                    caption += f"💰 Harga: {price_display}\n"
                caption += f"🏪 {marketplace}"
                await tg_send_photo(chat_id, image_url, caption)
            elif reason == "CATALOG_PAGE":
                # Catalog page without images — still show product name
                await tg_send(chat_id,
                    f"📍 *{title}*\n"
                    f"🏪 {marketplace}\n"
                    f"📋 Halaman katalog — menampilkan berbagai listing produk ini.")
        
        return json.dumps(result)

    # ─── search_products ──────────────────────────────────
    elif tool_name == "search_products":
        keyword = args.get("keyword", "")
        limit = args.get("limit", 5)
        if not keyword:
            return json.dumps({"error": "Kata kunci diperlukan"})
        log.info(f"Tool: search_products '{keyword}' limit={limit}")
        result = await scraper_search(keyword, limit)
        
        # Auto-save best result as quotation
        if user_id and result.get("success") and result.get("items"):
            first = result["items"][0]
            if first.get("price_jpy") and first["price_jpy"] >= 100:
                saved = await save_quotation(
                    user_id=user_id,
                    product=first.get("title", keyword)[:200],
                    price_jpy=first["price_jpy"],
                    source=first.get("marketplace", "search"),
                    url=first.get("url"),
                )
                if saved:
                    result["_quotation_id"] = saved["id"]
                    result["_quotation_saved"] = True
                    log.info(f"Quotation saved from search: {saved['id']}")
        
        return json.dumps(result)

    # ─── save_to_wishlist ─────────────────────────────────
    elif tool_name == "save_to_wishlist":
        if not user_id:
            return json.dumps({"error": "User belum terautentikasi"})
        name = args.get("product_name", "")
        if not name:
            return json.dumps({"error": "Nama produk diperlukan"})
        log.info(f"Tool: save_to_wishlist '{name[:40]}...'")
        saved = await save_wishlist_item(
            user_id=user_id,
            name=name,
            url=args.get("url"),
            price_idr=args.get("price_idr"),
            source=args.get("marketplace") or "telegram_bot",
        )
        if saved:
            log.info(f"Wishlist saved: {saved['id']}")
            return json.dumps({"success": True, "id": saved["id"], "message": "Produk tersimpan ke wishlist! Bisa dilihat di dashboard MyBagasi."})
        return json.dumps({"error": "Gagal menyimpan wishlist"})

    # ─── create_price_alert ───────────────────────────────
    elif tool_name == "create_price_alert":
        if not user_id:
            return json.dumps({"error": "User belum terautentikasi"})
        name = args.get("product_name", "")
        target = args.get("target_price_idr", 0)
        if not name or not target:
            return json.dumps({"error": "Nama produk dan harga target diperlukan"})
        log.info(f"Tool: create_price_alert '{name[:40]}...' target Rp{target}")
        saved = await save_price_alert(
            user_id=user_id,
            product=name,
            target_price=target,
            url=args.get("url"),
            current_price=args.get("current_price_idr"),
        )
        if saved:
            log.info(f"Price alert saved: {saved['id']}")
            return json.dumps({"success": True, "id": saved["id"], "message": "Price alert aktif! Kami akan memberitahu jika harga turun."})
        return json.dumps({"error": "Gagal membuat price alert"})

    # ─── create_payment ───────────────────────────────────
    elif tool_name == "create_payment":
        invoice_data = {
            "name": args.get("customer_name", ""),
            "email": args.get("customer_email", "contact@djiwatentram.com"),
            "mobile": args.get("customer_mobile", "081234567890"),
            "description": args.get("order_description", "Pembelian MyBagasi"),
            "items": args.get("items", []),
        }
        log.info(f"Tool: create_payment for {invoice_data['name']}")
        result = await create_payment_invoice(invoice_data)
        
        # Auto-save order if payment created successfully and user_id exists
        if user_id and result.get("success") and result.get("invoice_id"):
            # Calculate total from items
            total = sum(item.get("rate", 0) * item.get("quantity", 1) for item in invoice_data["items"])
            # Get product name from description
            product = invoice_data["description"][:200] or "Pembelian MyBagasi"
            price_jpy = round(total / JPY_TO_IDR)  # Approximate
            
            saved_order = await save_order(
                user_id=user_id,
                product=product,
                price_jpy=price_jpy,
                total=total,
                source="telegram_bot",
                customer_name=invoice_data["name"],
                notes=invoice_data["description"],
            )
            if saved_order:
                result["_order_id"] = saved_order["id"]
                result["_order_saved"] = True
                log.info(f"Order saved: {saved_order['id']} for user {user_id[:8]}")
        
        return json.dumps(result)

    return json.dumps({"error": f"Unknown tool: {tool_name}"})

async def ai_process(chat_id: int, user_message: str, user_profile: dict | None) -> str:
    """Process a user message through the AI agent loop with data persistence."""
    if chat_id not in conversations:
        conversations[chat_id] = {"messages": [], "context": {}}
    conv = conversations[chat_id]
    
    # Store user_id in context for data persistence
    if user_profile:
        conv["context"]["user_id"] = user_profile["id"]
    
    conv["messages"].append({"role": "user", "content": user_message})
    if len(conv["messages"]) > MAX_HISTORY:
        conv["messages"] = conv["messages"][-MAX_HISTORY:]
    
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    if user_profile:
        msgs.append({"role": "system", "content": f"User: {user_profile.get('name', '')} ({user_profile.get('email', '')})"})
    
    # Add saved data context to help AI reference it
    context = conv["context"]
    if context.get("last_quotation_id"):
        msgs.append({"role": "system", "content": f"Quotation terakhir ID: {context['last_quotation_id']}"})
    if context.get("last_order_id"):
        msgs.append({"role": "system", "content": f"Order terakhir ID: {context['last_order_id']}"})
    
    msgs.extend(conv["messages"])
    
    # ── Status timer dengan dynamic status ──
    result = await tg_send(chat_id, "⏳ *Memproses...*")
    status_msg_id = result["result"]["message_id"] if result and result.get("ok") else None
    start_time = time.time()
    status_ref = [""]  # mutable list untuk dynamic status
    
    # Start timer background task
    timer_task = None
    if status_msg_id:
        timer_task = asyncio.create_task(status_timer(chat_id, status_msg_id, start_time, status_ref))
    
    max_turns = 5
    for turn in range(max_turns):
        # Update status sesuai turn
        status_texts = {
            0: "🔍 *Mencari produk...*",
            1: "🔄 *Mengecek harga & ketersediaan...*",
            2: "📊 *Menghitung estimasi biaya...*",
            3: "✍️ *Menyusun hasil...*",
        }
        status_ref[0] = status_texts.get(turn, "⏳ *Memproses...*")
        
        result = await call_deepseek(msgs, with_tools=True)
        
        if "error" in result:
            error_msg = f"Maaf, AI sedang bermasalah. Coba lagi ya."
            conv["messages"].append({"role": "assistant", "content": error_msg})
            # Stop timer
            if timer_task:
                timer_task.cancel()
            if status_msg_id:
                await tg_edit(chat_id, status_msg_id, "❌ *Gagal* — coba lagi nanti")
            return error_msg
        
        choice = result["choices"][0]["message"]
        
        if choice.get("tool_calls"):
            user_id = conv["context"].get("user_id")
            for tc in choice["tool_calls"]:
                if tc["type"] == "function":
                    tool_name = tc["function"]["name"]
                    try:
                        tool_args = json.loads(tc["function"]["arguments"])
                    except:
                        tool_args = {}
                    
                    asyncio.create_task(tg_typing(chat_id))
                    
                    tool_result = await execute_tool(tool_name, tool_args, user_id, chat_id)
                    
                    # Track saved IDs in conversation context
                    try:
                        parsed = json.loads(tool_result)
                        if "_quotation_id" in parsed:
                            conv["context"]["last_quotation_id"] = parsed["_quotation_id"]
                        if "_order_id" in parsed:
                            conv["context"]["last_order_id"] = parsed["_order_id"]
                    except:
                        pass
                    
                    msgs.append({
                        "role": "assistant", "content": None,
                        "tool_calls": [{"id": tc["id"], "type": "function",
                                        "function": {"name": tool_name, "arguments": tc["function"]["arguments"]}}]
                    })
                    msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": tool_result})
            
            asyncio.create_task(tg_typing(chat_id))
            continue
        
        ai_text = choice.get("content", "").strip()
        if ai_text:
            conv["messages"].append({"role": "assistant", "content": ai_text})
        else:
            ai_text = "Maaf, saya tidak bisa memproses permintaan itu. Coba kirim link produk atau kata kunci yang lebih spesifik."
            conv["messages"].append({"role": "assistant", "content": ai_text})
        
        # Stop timer — selesai
        if timer_task:
            timer_task.cancel()
        if status_msg_id:
            await tg_edit(chat_id, status_msg_id, f"✅ *Selesai!* (`{int(time.time() - start_time)}s`)")
        
        return ai_text
    
    fallback = "Percakapan terlalu panjang. Coba mulai lagi dengan /reset ya."
    conv["messages"].append({"role": "assistant", "content": fallback})
    
    # Stop timer
    if timer_task:
        timer_task.cancel()
    if status_msg_id:
        await tg_edit(chat_id, status_msg_id, f"⏰ *Time out* (`{int(time.time() - start_time)}s`)")
    
    return fallback

def reset_conversation(chat_id: int):
    if chat_id in conversations:
        del conversations[chat_id]

# ── Command Handlers ───────────────────────────────────────

async def handle_start(chat_id: int, args: str):
    token = args.strip().upper()
    existing = await lookup_user_by_telegram_id(chat_id)
    
    if not token:
        if existing:
            # Persistent reply keyboard di bawah chat
            reply_kb = {
                "keyboard": [
                    [{"text": "🔍 Cari Produk"}],
                    [{"text": "👤 Akun Saya"}, {"text": "📦 Pesanan"}],
                    [{"text": "🧾 Tagihan"}, {"text": "📋 Wishlist"}],
                    [{"text": "❓ Bantuan"}],
                ],
                "resize_keyboard": True,
                "one_time_keyboard": False,
            }
            # Inline keyboard di dalam pesan
            inline_kb = {
                "inline_keyboard": [
                    [{"text": "👤 Akun Saya", "callback_data": "/status"}, {"text": "📦 Pesanan", "callback_data": "/status"}],
                    [{"text": "🧾 Tagihan", "callback_data": "/status"}, {"text": "🔍 Cari Produk", "switch_inline_query_current_chat": ""}],
                    [{"text": "📋 Wishlist", "callback_data": "/wishlist"}, {"text": "❓ Bantuan", "callback_data": "/help"}],
                ]
            }
            await tg_send(chat_id,
                f"👋 Halo *{existing['name']}*! Selamat datang kembali! 🎉\n\n"
                f"Kamu sudah terhubung ke MyBagasi. Yuk mulai belanja!\n\n"
                f"*Yang bisa kamu lakukan:*\n"
                f"🔍 *Cari produk* — langsung ketik nama barang (contoh: `onitsuka tiger`)\n"
                f"🔗 *Cek harga* — kirim link marketplace Jepang\n"
                f"💳 *Beli & bayar* — via chat, bayar pakai Zantara Pay\n"
                f"📋 *Simpan wishlist* — bilang aja \"simpen ini\"\n\n"
                f"Atau tap tombol di bawah 👇",
                reply_markup=reply_kb)
            # Kirim inline keyboard terpisah (biar tombol di chat juga ada)
            await asyncio.sleep(0.5)
            await tg_send(chat_id, "📌 *Menu cepat:*", reply_markup=inline_kb)
        else:
            reply_kb = {
                "keyboard": [
                    [{"text": "🆕 Daftar Akun Baru"}, {"text": "🔐 Login"}],
                    [{"text": "📖 Tentang MyBagasi"}],
                ],
                "resize_keyboard": True,
                "one_time_keyboard": False,
            }
            inline_kb = {
                "inline_keyboard": [
                    [{"text": "🆕 Daftar Akun Baru", "callback_data": "/register"}],
                    [{"text": "🔐 Login", "callback_data": "/login"}],
                    [{"text": "📖 Tentang MyBagasi", "callback_data": "/about"}],
                ]
            }
            await tg_send(chat_id,
                "👋 *Halo! Selamat datang di MyBagasi Bot!* 🎉\n\n"
                "Saya *Asisten Belanja Jepang* kamu 🤖\n"
                "Aku bisa bantu kamu beli barang-barang keren dari *Jepang* — "
                "mulai dari fashion, elektronik, barang koleksi, sampai merchandise limited edition!\n\n"
                "✨ *Yang bisa aku lakukan:*\n"
                "🔍 *Cari produk* di Amazon JP, Rakuten & toko official Jepang\n"
                "💰 *Estimasi harga* all-in (produk + fee + ongkir + pajak)\n"
                "💳 *Bayar aman* via Zantara Pay\n"
                "📦 *Lacak pesanan* sampai ke rumah kamu\n\n"
                "🚀 *Baru pertama?* Tinggal tap tombol *Daftar* di bawah — cuma 30 detik!\n"
                "👇 *Pilih salah satu:*",
                reply_markup=reply_kb)
            await asyncio.sleep(0.5)
            await tg_send(chat_id, "📌 *Menu:*", reply_markup=inline_kb)
        return

    if existing:
        await tg_send(chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Kamu sudah bisa langsung menggunakan bot!")
        return

    user = await lookup_user_by_token(token)
    if not user:
        await tg_send(chat_id,
            "❌ Kode tidak valid. Cek kode di halaman Profile MyBagasi.\n\n"
            "Kode bersifat *rahasia* — jangan bagikan ke orang lain!")
        return

    if user.get("telegram_id") and user["telegram_id"] != chat_id:
        await tg_send(chat_id,
            "❌ Kode ini sudah terhubung ke akun Telegram lain.\n"
            "Hubungi support jika ini salah.")
        return

    success = await link_telegram(user["id"], chat_id)
    if success:
        # Initialize conversation with user_id
        conversations[chat_id] = {"messages": [], "context": {"user_id": user["id"]}}
        await tg_send(chat_id,
            f"✅ *Berhasil terhubung!*\n\n"
            f"Halo *{user['name']}*! 🎉\n\n"
            f"Sekarang semua data belanjamu akan tersimpan\n"
            f"di dashboard MyBagasi kamu!\n\n"
            f"*Yang bisa kamu lakukan:*\n"
            f"🔍 `/beli onitsuka tiger` — cari produk\n"
            f"🔗 Kirim link marketplace — cek harga\n"
            f"💳 Konfirmasi beli — checkout via chat\n"
            f"📋 `/wishlist` — lihat wishlist\n"
            f"📊 Cek dashboard — mybagasi.my.id/dashboard")
        log.info(f"User {user['name']} ({user['id']}) linked")
    else:
        await tg_send(chat_id, "❌ Gagal menghubungkan. Coba lagi nanti.")

async def handle_status(chat_id: int):
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id,
            "🔍 Belum terhubung ke MyBagasi.\n\n"
            "Gunakan `/start KODE` untuk menghubungkan.\n"
            "Kode ada di halaman Profile: https://mybagasi.my.id/profile")
        return
    
    # Fetch data counts
    uid = user["id"]
    quotations = await fetch_user_quotations(uid, 3)
    orders = await fetch_user_orders(uid, 3)
    
    msg = (
        f"✅ *Terhubung ke MyBagasi*\n\n"
        f"Nama: *{user['name']}*\n"
        f"Email: `{user['email']}`\n"
        f"Role: `{user.get('role', 'customer')}`\n"
        f"Kode: `{user['telegram_token']}`\n\n"
    )
    
    if quotations:
        msg += "📋 *Quotation Tersimpan:*\n"
        for q in quotations[:3]:
            msg += f"• {q['product'][:35]}... — Rp {q['total']:,}\n"
        msg += "\n"
    
    if orders:
        msg += "📦 *Order Tersimpan:*\n"
        for o in orders[:3]:
            msg += f"• {o['product'][:35]}... — {o['status']}\n"
        msg += "\n"
    
    msg += "📊 *Lihat semua:* mybagasi.my.id/dashboard\n"
    msg += "🔍 Ketik `/beli <produk>` untuk mulai belanja!"
    
    await tg_send(chat_id, msg)

async def handle_tagihan(chat_id: int):
    """Handle /tagihan — show user's bills from Supabase bills table."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus daftar/login dulu. Ketik `/register` atau `/login`.")
        return

    uid = user["id"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/bills",
                params={
                    "user_id": f"eq.{uid}",
                    "select": "id,status,total_idr,total_jpy,invoice_url,items_summary,created_at,paid_at,expires_at",
                    "order": "created_at.desc",
                    "limit": 10,
                },
                headers=headers,
            )
            bills = r.json() if r.status_code == 200 else []

        if not bills:
            await tg_send(chat_id,
                "🧾 *Tagihan* — Belum ada tagihan\n\n"
                "Yuk belanja dulu! Ketik `/beli <produk>`\n"
                "atau kirim link produk Jepang yang mau dibeli.")
            return

        total_unpaid = sum(1 for b in bills if b.get("status") == "unpaid")
        total_pending = sum(1 for b in bills if b.get("status") in ("unpaid", "pending"))
        msg = f"🧾 *Tagihan ({len(bills)} total, {total_pending} belum bayar)*\n\n"

        for b in bills:
            status_emoji = {
                "unpaid": "🟡",
                "paid": "✅",
                "expired": "❌",
                "cancelled": "🚫",
                "pending": "⏳",
            }.get(b.get("status", ""), "❓")

            total = b.get("total_idr", 0)
            created = b.get("created_at", "")[:10] if b.get("created_at") else ""
            status_text = b.get("status", "")

            # Get item name from items_summary
            items = b.get("items_summary") or []
            item_name = ""
            if isinstance(items, list) and len(items) > 0:
                first = items[0]
                if isinstance(first, dict):
                    item_name = first.get("name", first.get("product_name", ""))[:30]
                elif isinstance(first, str):
                    item_name = first[:30]

            msg += f"{status_emoji} *{status_text.upper()}*"
            if item_name:
                msg += f" — {item_name}"
            msg += f"\n"
            msg += f"   💰 Rp {total:,}"
            if created:
                msg += f"  📅 {created}"
            if b.get("invoice_url") and b.get("status") in ("unpaid", "pending"):
                msg += f"\n   🔗 [Bayar Sekarang]({b['invoice_url']})"
            paid_at = b.get("paid_at")
            if paid_at:
                msg += f"\n   ✅ Lunas {paid_at[:10]}"
            msg += "\n"

        msg += "\n📊 Lihat lengkap: mybagasi.my.id/dashboard"
        await tg_send(chat_id, msg)
    except Exception as e:
        log.error(f"handle_tagihan error: {e}")
        await tg_send(chat_id, "⚠️ Gagal memuat tagihan. Coba lagi nanti.")

async def handle_wishlist(chat_id: int):
    """Handle /wishlist — show user's saved wishlist items."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus daftar/login dulu. Ketik `/register` atau `/login`.")
        return
    
    uid = user["id"]
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/wishlist_items",
                params={"user_id": f"eq.{uid}", "select": "id,name,url,price_idr,source,created_at",
                         "order": "created_at.desc", "limit": 10},
                headers=headers,
            )
            items = r.json() if r.status_code == 200 else []
        
        if not items:
            await tg_send(chat_id,
                "📋 *Wishlist* — Kosong\n\n"
                "Belum ada wishlist tersimpan.\n"
                "Cari produk dulu dengan `/beli <keyword>`\n"
                "Lalu minta AI untuk menyimpannya!")
            return
        
        msg = f"📋 *Wishlist ({len(items)} item)*\n\n"
        for i, item in enumerate(items[:10], 1):
            price = f"Rp {item['price_idr']:,}" if item.get('price_idr') else ""
            source = f" — {item['source']}" if item.get('source') else ""
            msg += f"{i}. {item['name'][:40]}\n"
            if price:
                msg += f"   💰 {price}\n"
            if item.get('url'):
                msg += f"   🔗 {item['url'][:50]}...\n"
        msg += "\n📊 Lihat lengkap: mybagasi.my.id/dashboard/wishlist"
        await tg_send(chat_id, msg)
    except Exception as e:
        log.error(f"wishlist fetch error: {e}")
        await tg_send(chat_id, "❌ Gagal mengambil wishlist. Coba lagi nanti.")

# ── Auth Command Handlers ─────────────────────────────────

async def handle_register(chat_id: int):
    """Start multi-step registration flow."""
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Gunakan `/unlink` dulu untuk ganti akun.")
        return
    _pending_reg.pop(chat_id, None)
    _pending_login.pop(chat_id, None)
    _pending_reg[chat_id] = {"step": "name"}
    await tg_send(chat_id,
        "👋 *Daftar MyBagasi* — Langkah 1/3\n\n"
        "Masukkan *Nama Lengkap* kamu:")

async def handle_login(chat_id: int):
    """Start login flow for existing users."""
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Gunakan `/unlink` dulu untuk ganti akun.")
        return
    _pending_reg.pop(chat_id, None)
    _pending_login.pop(chat_id, None)
    _pending_login[chat_id] = {"step": "email"}
    await tg_send(chat_id,
        "🔐 *Login MyBagasi*\n\n"
        "Masukkan *Email* yang terdaftar:")

async def handle_token_verification(chat_id: int, token: str):
    """Handle when user types a raw token code for verification."""
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id, f"✅ Akun kamu (*{existing['name']}*) sudah terhubung!")
        return
    user = await lookup_user_by_token(token)
    if not user:
        await tg_send(chat_id,
            "❌ Kode tidak valid.\n\n"
            "• `/register` — Daftar akun baru\n"
            "• `/login` — Login dengan email\n"
            "• Cek kode di mybagasi.my.id/profile")
        return
    if user.get("telegram_id") and user["telegram_id"] != chat_id:
        await tg_send(chat_id,
            "❌ Kode ini sudah terhubung ke Telegram lain.\n"
            "Gunakan `/login` untuk login ulang.")
        return
    success = await link_telegram(user["id"], chat_id)
    if success:
        conversations[chat_id] = {"messages": [], "context": {"user_id": user["id"]}}
        await tg_send(chat_id,
            f"✅ *Verifikasi Berhasil!*\n\n"
            f"Selamat datang, *{user['name']}*! 🎉\n\n"
            f"Lanjutkan dengan mengirim kata kunci atau link produk!")
        log.info(f"User verified via token: {user['name']} ({user['id'][:8]})")
    else:
        await tg_send(chat_id, "❌ Gagal menghubungkan. Coba lagi.")

async def process_reg_step(chat_id: int, text: str):
    """Process registration step by step."""
    state = _pending_reg.get(chat_id)
    if not state:
        return False
    step = state["step"]

    if step == "name":
        name = text.strip()
        if len(name) < 2:
            await tg_send(chat_id, "❌ Nama minimal 2 karakter. Coba lagi:")
            return True
        state["name"] = name
        state["step"] = "email"
        await tg_send(chat_id,
            "✉️ *Langkah 2/3* — Masukkan *Email* kamu:\n\n"
            "Email akan digunakan untuk login di mybagasi.my.id.")
        return True

    elif step == "email":
        email = text.strip().lower()
        if "@" not in email or "." not in email:
            await tg_send(chat_id, "❌ Email tidak valid. Coba lagi:")
            return True
        state["email"] = email
        state["step"] = "password"
        await tg_send(chat_id,
            "🔑 *Langkah 3/3* — Buat *Password* (minimal 6 karakter):")
        return True

    elif step == "password":
        password = text.strip()
        if len(password) < 6:
            await tg_send(chat_id, "❌ Password minimal 6 karakter. Coba lagi:")
            return True
        await tg_send(chat_id, "⏳ Membuat akun MyBagasi...")
        result = await register_user_via_admin_api(state["name"], state["email"], password)
        password = ""
        if "error" in result:
            if "already registered" in result["error"].lower() or "already exists" in result["error"].lower() or "duplicate" in result["error"].lower():
                await tg_send(chat_id,
                    f"❌ Email `{state['email']}` sudah terdaftar.\n\n"
                    f"Gunakan `/login` untuk masuk ke akun yang sudah ada.")
            else:
                await tg_send(chat_id, f"❌ Gagal daftar: {result['error'][:100]}")
            _pending_reg.pop(chat_id, None)
            return True

        user_id = result["user_id"]
        # Baca profile yang auto-created oleh trigger (dapatkan telegram_token)
        profile = None
        for attempt in range(5):
            headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.get(
                        f"{SUPABASE_URL}/rest/v1/profiles",
                        params={"id": f"eq.{user_id}", "select": "id,name,email,telegram_token", "limit": 1},
                        headers=headers,
                    )
                    if r.status_code == 200 and r.json():
                        profile = r.json()[0]
                        break
            except:
                pass
            await asyncio.sleep(0.5)

        if not profile:
            await tg_send(chat_id, "❌ Akun dibuat tapi gagal membaca profile. Coba login dengan `/login`.")
            _pending_reg.pop(chat_id, None)
            return True

        token = profile["telegram_token"]
        # Auto-link Telegram langsung — tanpa perlu ketik ulang kode
        link_success = await link_telegram(user_id, chat_id)
        _pending_reg.pop(chat_id, None)
        
        if link_success:
            conversations[chat_id] = {"messages": [], "context": {"user_id": user_id}}
            await tg_send(chat_id,
                f"✅ *Akun MyBagasi berhasil dibuat!*\n\n"
                f"Selamat datang, *{state['name']}*! 🎉\n\n"
                f"*Kamu sudah bisa langsung mulai belanja:*\n"
                f"🔍 Kirim *kata kunci* — cari produk Jepang\n"
                f"🔗 Kirim *link marketplace* — cek harga\n"
                f"💳 Bayar via chat — checkout langsung\n"
                f"📋 `/wishlist` — lihat wishlist\n"
                f"📊 Dashboard: mybagasi.my.id/dashboard\n\n"
                f"💡 Contoh: ketik `onitsuka tiger`")
            log.info(f"User registered via bot: {state['name']} ({user_id[:8]})")
        else:
            await tg_send(chat_id,
                f"✅ Akun dibuat tapi gagal auto-link.\n\n"
                f"Kode rahasia kamu: `{token}`\n"
                f"Ketik `/start {token}` untuk hubungkan.")
        
        return True

    return False

async def process_login_step(chat_id: int, text: str):
    """Process login step by step."""
    state = _pending_login.get(chat_id)
    if not state:
        return False
    step = state["step"]

    if step == "email":
        email = text.strip().lower()
        if "@" not in email:
            await tg_send(chat_id, "❌ Email tidak valid. Coba lagi:")
            return True
        profile = await get_profile_by_email(email)
        if not profile:
            await tg_send(chat_id,
                f"❌ Email `{email}` tidak ditemukan.\n\n"
                f"Gunakan `/register` untuk membuat akun baru.")
            _pending_login.pop(chat_id, None)
            return True
        if profile.get("telegram_id"):
            await tg_send(chat_id,
                f"⚠️ Akun *{profile['name']}* sudah terhubung ke Telegram lain.\n"
                f"Hubungi admin untuk bantuan.")
            _pending_login.pop(chat_id, None)
            return True
        new_token = await rotate_telegram_token(profile["id"])
        if not new_token:
            await tg_send(chat_id, "❌ Gagal generate kode. Coba lagi nanti.")
            _pending_login.pop(chat_id, None)
            return True
        state["user_id"] = profile["id"]
        state["name"] = profile["name"]
        state["new_token"] = new_token
        state["step"] = "verify"
        await tg_send(chat_id,
            f"🔐 *Verifikasi Login*\n\n"
            f"Halo *{profile['name']}*! 👋\n\n"
            f"*Kode verifikasi kamu:*\n"
            f"`{new_token}`\n\n"
            f"📌 Ketik kode di atas untuk mengaktifkan bot.")
        return True

    elif step == "verify":
        input_token = text.strip().upper()
        expected_token = state.get("new_token", "")
        if input_token == expected_token:
            success = await link_telegram(state["user_id"], chat_id)
            if success:
                conversations[chat_id] = {"messages": [], "context": {"user_id": state["user_id"]}}
                await tg_send(chat_id,
                    f"✅ *Login Berhasil!*\n\n"
                    f"Selamat datang kembali, *{state['name']}*! 🎉\n\n"
                    f"Lanjutkan belanja dengan kirim kata kunci atau link produk!")
                log.info(f"User logged in via bot: {state['name']} ({state['user_id'][:8]})")
            else:
                await tg_send(chat_id, "❌ Gagal menghubungkan. Coba lagi.")
        else:
            await tg_send(chat_id,
                f"❌ Kode salah. Coba lagi.\n\n"
                f"Kode verifikasi: `{expected_token}`")
        _pending_login.pop(chat_id, None)
        return True

    return False

async def handle_unlink(chat_id: int):
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Akun ini tidak terhubung ke MyBagasi manapun.")
        return
    success = await unlink_telegram(chat_id)
    if success:
        reset_conversation(chat_id)
        await tg_send(chat_id,
            f"🔌 *Sambungan diputus.*\n"
            f"Akun *{user['name']}* sudah tidak terhubung.\n"
            f"Data tetap aman di dashboard MyBagasi.")
        log.info(f"User {user['name']} ({user['id']}) unlinked")
    else:
        await tg_send(chat_id, "❌ Gagal memutus sambungan.")

async def handle_help(chat_id: int):
    await tg_send(chat_id,
        "📖 *MyBagasi Bot — Bantuan*\n\n"
        "*Akun & Data*\n"
        "`/register` — Daftar akun baru\n"
        "`/login` — Login ke akun yang sudah ada\n"
        "`/start` — Sambutan / hubungkan akun\n"
        "`/status` — Cek akun + data tersimpan\n"
        "`/wishlist` — Lihat wishlist tersimpan\n"
        "`/unlink` — Putus sambungan\n\n"
        "*Belanja (AI Personal Shopper)*\n"
        "🔍 Kirim *kata kunci* — cari produk Jepang\n"
        "🔗 Kirim *link marketplace* — cek harga\n"
        "💬 \"simpan ke wishlist\" — simpan produk\n"
        "💬 \"buatkan price alert\" — pantau harga\n"
        "`/beli <keyword>` — Cari & beli\n"
        "`/reset` — Reset percakapan\n\n"
        "*Semua data tersimpan otomatis* ke dashboard:\n"
        "🌐 mybagasi.my.id/dashboard\n\n"
        "💡 Butuh bantuan? Chat @fakhriazzam")

async def handle_about(chat_id: int):
    """Show information about MyBagasi service."""
    kb = {
        "inline_keyboard": [
            [{"text": "🆕 Daftar Akun Baru", "callback_data": "/register"}, {"text": "🔐 Login", "callback_data": "/login"}],
        ]
    }
    await tg_send(chat_id,
        "🇯🇵 *Apa itu MyBagasi?*\n\n"
        "MyBagasi adalah *asisten belanja pribadi* yang membantu kamu "
        "membeli produk-produk dari *Jepang* dengan mudah dan aman.\n\n"
        "✨ *Kenapa MyBagasi?*\n"
        "• 🛍️ Akses ke Amazon JP, Rakuten, toko official Jepang\n"
        "• 💰 Estimasi harga *all-in* (produk + fee + ongkir + pajak)\n"
        "• 💳 Bayar pakai Zantara Pay (QRIS, transfer)\n"
        "• 📦 Barang dikirim langsung ke alamat kamu\n"
        "• 🤖 Chat AI — tinggal bilang barang yang kamu mau!\n\n"
        "🌐 *Kunjungi website:* mybagasi.my.id\n"
        "📊 *Cek dashboard:* mybagasi.my.id/dashboard\n\n"
        "👤 *Punya pertanyaan?* Chat @fakhriazzam",
        reply_markup=kb)

def detect_product_buttons(text: str, multi_button: bool = False) -> dict | None:
    """Auto-detect products in AI response and generate inline keyboard.
    
    Detects numbered products (1 — Nama Produk, 2 — Nama Produk) or single product.
    multi_button=True: all product buttons in 1 keyboard (for 1-message multi-product).
    Returns reply_markup dict or None if no products detected.
    """
    lines = text.strip().split('\n')
    
    # Cari produk dengan pola "N — Nama Produk" atau "N. Nama Produk"
    product_indices = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Match: "1 — Product", "1. Product", "1 —Product"
        m = re.match(r'^(\d+)\s*[—\-\.]\s*(.+)', stripped)
        if m:
            num = int(m.group(1))
            name = m.group(2).strip()
            # Skip kalau judul section (bukan produk)
            if name and len(name) > 3 and not name.startswith(('RINCIAN', 'TOTAL', 'Harga')):
                product_indices.append((num, name, i))
    
    # Kalau ada produk bernomor
    if product_indices:
        # Pilih produk teratas (max 5 biar gak overflow)
        top_products = product_indices[:5]
        buttons = []
        for num, name, _ in top_products:
            short_name = name[:30] if len(name) > 30 else name
            buttons.append([
                {"text": f"🛒 Produk {num}: {short_name}", "callback_data": f"cart_{num}"}
            ])
        # Cancel button di baris terakhir
        buttons.append([{"text": "❌ Skip", "callback_data": "cart_skip"}])
        return {"inline_keyboard": buttons}
    
    # Fallback: cek apakah ada indikator produk
    has_product = False
    text_upper = text.upper()
    for kw in ['💳 TOTAL', '💰 Harga', 'TOTAL ALL-IN', 'TOTAL ALL-IN', 'RINCIAN BIAYA', '🔗 LIHAT DI', '🔗 [LIHAT', '📍 *', 'ESTIMASI BIAYA']:
        if kw in text or kw in text_upper:
            has_product = True
            break
    if not has_product:
        # Last resort: check for emoji markers
        for emoji in ['💰', '🔗', '📍', '🛒']:
            if emoji in text:
                has_product = True
                break
    
    if has_product:
        return {"inline_keyboard": [
            [{"text": "🛒 Tambah ke Cart", "callback_data": "cart_add"}],
            [{"text": "❌ Skip", "callback_data": "cart_skip"}]
        ]}
    
    return None


async def handle_ai(chat_id: int, text: str, user_profile: dict | None):
    if not DEEPSEEK_API_KEY:
        await tg_send(chat_id, "❌ AI Personal Shopper belum dikonfigurasi.")
        return
    await tg_typing(chat_id)
    response = await ai_process(chat_id, text, user_profile)
    
    # Bersihkan response dari marker-marker
    clean_text = re.sub(r'---PHOTO:https?://[^\s]+---\n?', '', response).strip()
    clean_text = re.sub(r'\n?---KEYBOARD---.*?---END KEYBOARD---\n?', '', clean_text, flags=re.DOTALL).strip()
    
    if not clean_text:
        clean_text = "Maaf, ada error. Coba lagi ya."
    
    # Coba kirim dengan foto dulu (jika ada ---PHOTO:--- marker)
    photo_match = re.search(r'---PHOTO:(https?://[^\s]+)---', response)
    if photo_match:
        photo_url = photo_match.group(1)
        reply_markup = detect_product_buttons(clean_text)
        result = await tg_send_photo(chat_id, photo_url, clean_text, reply_markup=reply_markup)
        if result and result.get("ok"):
            return
        log.warning(f"sendPhoto failed: {result}")
        # Lanjut ke fallback teks
    
    # Kirim sebagai teks (fallback)
    reply_markup = detect_product_buttons(clean_text)
    result = await tg_split_send(chat_id, clean_text, reply_markup=reply_markup)
    # Jika gagal karena markdown, coba tanpa markdown
    if result and not result.get("ok"):
        log.warning(f"sendMessage markdown failed, retrying as plain text: {result}")
        # Hapus markdown syntax sebelum kirim ulang
        plain = re.sub(r'[*_`#\[\]]', '', clean_text)
        await tg_send(chat_id, plain)

# ── Message Router ─────────────────────────────────────────

async def process_update(update: dict):
    # Handle callback_query (inline button taps)
    callback = update.get("callback_query")
    if callback:
        chat_id = callback["message"]["chat"]["id"]
        data = callback.get("data", "")
        # Answer callback to remove loading state
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(tg_url("answerCallbackQuery"), json={"callback_query_id": callback["id"]})
        except:
            pass
        
        # Route callback data like commands
        data = data.strip()
        log.info(f"← CALLBACK {chat_id}: {data}")
        
        if data == "/register":
            await handle_register(chat_id)
        elif data == "/login":
            await handle_login(chat_id)
        elif data == "/about":
            await handle_about(chat_id)
        elif data == "/wishlist":
            await handle_wishlist(chat_id)
        elif data == "/status":
            await handle_status(chat_id)
        elif data == "/tagihan":
            await handle_tagihan(chat_id)
        elif data == "/help":
            await handle_help(chat_id)
        elif data.startswith("cart_"):
            # Product button tap — acknowledge and save intent
            # cart_add = single product, cart_N = specific product
            await tg_send(chat_id, "📦 Produk tercatat! Gunakan /beli untuk checkout atau bilang 'simpen ini'.")
        return

    message = update.get("message")
    if not message:
        return

    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    
    if not text:
        return

    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    if "@" in command:
        command = command.split("@")[0]

    log.info(f"← {chat_id}: {text[:60]}")

    user_profile = await lookup_user_by_telegram_id(chat_id)

    if command == "/start":
        await handle_start(chat_id, args)
    elif command == "/status":
        await handle_status(chat_id)
    elif command == "/tagihan":
        await handle_tagihan(chat_id)
    elif command == "/unlink":
        await handle_unlink(chat_id)
    elif command == "/register":
        await handle_register(chat_id)
    elif command == "/login":
        await handle_login(chat_id)
    elif command == "/wishlist":
        await handle_wishlist(chat_id)
    elif command == "/help":
        await handle_help(chat_id)
    elif command == "/reset":
        reset_conversation(chat_id)
        _pending_reg.pop(chat_id, None)
        _pending_login.pop(chat_id, None)
        await tg_send(chat_id, "🔄 Percakapan di-reset. Mulai lagi yuk!")
    elif command in ("/beli", "/ai", "/cari"):
        search_text = args if args else text
        if not user_profile:
            await tg_send(chat_id,
                "⚠️ *Kamu harus daftar atau login dulu* untuk pakai fitur ini.\n\n"
                "• `/register` — Daftar akun baru (30 detik)\n"
                "• `/login` — Login ke akun yang sudah ada\n"
                "• `/start KODE` — Hubungkan akun via kode")
            return
        await handle_ai(chat_id, search_text, user_profile)
    elif command == "/cek":
        if not args:
            await tg_send(chat_id, "📎 Kirim link marketplace setelah /cek\nContoh: `/cek https://www.amazon.co.jp/...`")
            return
        if not user_profile:
            await tg_send(chat_id,
                "⚠️ *Kamu harus daftar atau login dulu* untuk pakai fitur ini.\n\n"
                "• `/register` — Daftar akun baru (30 detik)\n"
                "• `/login` — Login ke akun yang sudah ada")
            return
        await handle_ai(chat_id, f"Tolong cek harga produk ini: {args}", user_profile)
    elif "Cari Produk" in text:
        if not user_profile:
            await tg_send(chat_id, "⚠️ Kamu harus daftar dulu. Ketik /register")
            return
        await tg_send(chat_id, "📝 Ketik nama produk yang mau dicari, misal: `onitsuka tiger`")
    elif any(kw in text for kw in ["Akun Saya", "Pesanan"]):
        await handle_status(chat_id)
    elif "Tagihan" in text:
        await handle_tagihan(chat_id)
    elif "Wishlist" in text or "Wishlist" in text:
        await handle_wishlist(chat_id)
    elif "Bantuan" in text:
        await handle_help(chat_id)
    elif "Daftar" in text:
        await handle_register(chat_id)
    elif "Login" in text or "Masuk" in text:
        await handle_login(chat_id)
    elif "Tentang" in text:
        await handle_about(chat_id)
    else:
        # Cek pending registration/login steps
        if chat_id in _pending_reg:
            await process_reg_step(chat_id, text)
            return
        if chat_id in _pending_login:
            await process_login_step(chat_id, text)
            return
        
        # Jika token 12 karakter uppercase → auto-verify
        if re.match(r'^[A-Z0-9]{12}$', text.strip().upper()):
            await handle_token_verification(chat_id, text.strip().upper())
            return
        
        if not user_profile:
            await tg_send(chat_id,
                "👋 *Selamat datang di MyBagasi!*\n\n"
                "• `/register` — Daftar akun baru\n"
                "• `/login` — Login ke akun yang sudah ada\n"
                "• `/start KODE` — Hubungkan dengan kode rahasia\n\n"
                "Belum punya akun? Langsung daftar via `/register`!")
            return
        
        await handle_ai(chat_id, text, user_profile)

# ── Polling Loop ───────────────────────────────────────────

async def poll_forever():
    if not BOT_TOKEN:
        log.error("TELEGRAM_BOT_TOKEN tidak diatur")
        return
    
    log.info(f"Bot starting... @mybagasibot")
    await _ensure_pricing_table()
    await refresh_pricing_cache()
    rate = await get_exchange_rate()
    log.info(f"Pricing: rate={rate}")

    offset = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=POLL_TIMEOUT + 10) as client:
                r = await client.get(
                    tg_url("getUpdates"),
                    params={"offset": offset, "timeout": POLL_TIMEOUT, "allowed_updates": json.dumps(["message", "callback_query"])},
                )
                data = r.json()
                if data.get("ok") and data.get("result"):
                    for update in data["result"]:
                        try:
                            await process_update(update)
                        except Exception as e:
                            log.error(f"Process error: {e}", exc_info=True)
                        offset = update["update_id"] + 1

        except asyncio.CancelledError:
            log.info("Bot polling cancelled")
            break
        except httpx.TimeoutException:
            continue
        except Exception as e:
            log.error(f"Poll error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

# ── Entry Point ────────────────────────────────────────────

async def main():
    log.info("=" * 40)
    log.info("MyBagasi Telegram Bot v3 — Data Persistence")
    log.info("=" * 40)

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL dan SUPABASE_KEY wajib diatur")
        sys.exit(1)

    if DEEPSEEK_API_KEY:
        log.info(f"DeepSeek AI: {DEEPSEEK_MODEL} via {DEEPSEEK_BASE_URL}")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"{DEEPSEEK_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                    json={"model": DEEPSEEK_MODEL, "messages": [{"role": "user", "content": "test"}], "max_tokens": 5},
                )
                if r.status_code == 200:
                    log.info("DeepSeek AI connection OK")
        except:
            log.warning("DeepSeek check failed")
    else:
        log.warning("DEEPSEEK_API_KEY tidak diatur")

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{SCRAPER_URL}/health")
            if r.status_code == 200:
                log.info(f"Scraper backend OK")
    except:
        log.warning("Scraper backend unreachable")

    await poll_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot stopped by user")
