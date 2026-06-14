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
  /katalog         — Jelajahi katalog produk
  /wishlist        — Lihat wishlist tersimpan
  /help            — Bantuan
  /reset           — Reset percakapan AI
"""

import asyncio
import base64
import io
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx

# Browser session manager for interactive browsing
import browser_session as browser

# SQLite cache for per-user data persistence
import db_cache

# Database helper (local SQLite + Supabase fallback)
from db import db, auto_categorize

# ── Configuration ──────────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SCRAPER_URL = "http://localhost:8000"
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "")
SUMOPOD_BASE_URL = os.getenv("SUMOPOD_BASE_URL", "https://api.deepseek.com/v1")
SUMOPOD_MODEL = os.getenv("SUMOPOD_MODEL", "deepseek-chat")

# Sumopod (Gemini 2.5 Flash via Sumopod) — for browser vision & AI-driven browsing
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "")
SUMOPOD_BASE_URL = os.getenv("SUMOPOD_BASE_URL", "https://ai.sumopod.com/v1")
SUMOPOD_MODEL = os.getenv("SUMOPOD_MODEL", "gemini/gemini-2.5-flash")

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

# ── SQLite-backed conversation helpers ─────────────────

def _get_conv(chat_id: int) -> dict:
    """Load conversation from memory cache or SQLite."""
    if chat_id in conversations:
        return conversations[chat_id]
    data = db_cache.load_conversation(chat_id)
    if data:
        conversations[chat_id] = data
    else:
        conversations[chat_id] = {"messages": [], "context": {}}
    return conversations[chat_id]

def _save_conv(chat_id: int, messages: list, context: dict, user_id: str = None):
    """Save conversation to both memory cache and SQLite."""
    conversations[chat_id] = {"messages": messages, "context": context}
    db_cache.save_conversation(chat_id, messages, context, user_id=user_id)

def _del_conv(chat_id: int):
    """Delete conversation from both memory cache and SQLite."""
    conversations.pop(chat_id, None)
    db_cache.delete_conversation(chat_id)

# ── Telegram Helpers ──────────────────────────────────────

def tg_url(method: str) -> str:
    return f"{TELEGRAM_API}/{method}"


async def require_login(chat_id: int):
    """Send login prompt."""
    await tg_send(chat_id,
        "⚠️ *Kamu harus terhubung ke MyBagasi* untuk fitur ini.\n\n"
        "• `/register` — Daftar akun baru\n"
        "• `/login` — Login ke akun yang sudah ada\n"
        "• `/start KODE` — Hubungkan akun via kode")



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
    try:
        return db.get("profiles", {"telegram_token": token})
    except Exception as e:
        log.error(f"lookup_user error: {e}")
        return None

async def link_telegram(user_id: str, telegram_chat_id: int) -> bool:
    try:
        return db.update("profiles", {"telegram_id": str(telegram_chat_id), "last_active_at": datetime.now(timezone.utc).isoformat()}, "id", user_id)
    except Exception as e:
        log.error(f"link_telegram error: {e}")
        return False

async def unlink_telegram(telegram_chat_id: int) -> bool:
    try:
        return db.update("profiles", {"telegram_id": ""}, "telegram_id", str(telegram_chat_id))
    except Exception as e:
        log.error(f"unlink_telegram error: {e}")
        return False


# ─── Session management (24h inactivity expiry) ──────────

SESSION_TIMEOUT_HOURS = 24
SESSION_TIMEOUT_SECONDS = SESSION_TIMEOUT_HOURS * 3600
SESSION_CACHE: dict[int, float] = {}  # chat_id → last_active_timestamp

async def _update_last_active(chat_id: int):
    """Update last_active_at in DB + memory cache."""
    import time
    now = time.time()
    SESSION_CACHE[chat_id] = now
    try:
        db.update("profiles", {"last_active_at": datetime.now(timezone.utc).isoformat()}, "telegram_id", str(chat_id))
    except Exception as e:
        log.warning(f"update_last_active error: {e}")

async def _is_session_valid(chat_id: int) -> bool:
    """Check if user's session is still valid (within 24h inactivity)."""
    import time
    now = time.time()
    
    # Check memory cache first (fast path)
    cached = SESSION_CACHE.get(chat_id)
    if cached and (now - cached) < SESSION_TIMEOUT_SECONDS:
        return True
    
    # Check DB
    try:
        user = await lookup_user_by_telegram_id(chat_id)
        if not user:
            return False
        last_active = user.get("last_active_at")
        if not last_active:
            return True  # No record = first time, allow
        if isinstance(last_active, str):
            last = datetime.fromisoformat(last_active.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - last).total_seconds() > SESSION_TIMEOUT_SECONDS:
                return False  # Expired
            SESSION_CACHE[chat_id] = last.timestamp()  # Cache it
            return True
    except Exception as e:
        log.warning(f"session check error: {e}")
    return True  # On error, allow through

async def _notify_session_expired(chat_id: int):
    """Send expiry notice and clear keyboard."""
    empty_kb = {"keyboard": [], "resize_keyboard": True}
    await tg_send(chat_id,
        "🔐 *Sesi kamu sudah habis.*\n\n"
        "Demi keamanan, sesi login otomatis berakhir "
        f"setelah {SESSION_TIMEOUT_HOURS} jam tidak ada aktivitas.\n\n"
        "Ketik `/login` untuk masuk lagi.",
        reply_markup=empty_kb)


async def lookup_user_by_telegram_id(telegram_chat_id: int) -> dict | None:
    try:
        return db.get("profiles", {"telegram_id": str(telegram_chat_id)})
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
    try:
        return db.get("profiles", {"email": email.lower()})
    except Exception as e:
        log.error(f"get_profile_by_email error: {e}")
        return None

async def rotate_telegram_token(user_id: str) -> str | None:
    """Generate a new telegram_token for a user via DB update."""
    import random
    import string
    try:
        new_token = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
        if db.update("profiles", {"telegram_token": new_token}, "id", user_id):
            return new_token
        return None
    except Exception as e:
        log.error(f"rotate_token error: {e}")
        return None

# ── Supabase Data Persistence ─────────────────────────────

# ── Pricing System ──────────────────────────────────────────
_PRICING_CACHE_DATA: dict = {}
_PRICING_CACHE_AT = 0.0
_PRICING_CACHE_TTL = 300  # 5 menit

async def _ensure_pricing_table():
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
    for s in seed:
        try:
            if not db.get("pricing_config", {"key": s["key"]}):
                db.insert("pricing_config", s)
        except Exception:
            pass

async def refresh_pricing_cache():
    global _PRICING_CACHE_DATA, _PRICING_CACHE_AT
    now = time.time()
    if now - _PRICING_CACHE_AT < _PRICING_CACHE_TTL:
        return
    try:
        rows = db.query("pricing_config", limit=100)
        for item in rows:
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
                            val = {"rate": rate, "source": url.split('/')[2], "auto_update": True, "last_fetched": datetime.datetime.now(datetime.timezone.utc).isoformat()}
                            db.update("pricing_config", {"value": val}, "key", "exchange_rate")
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
    data["id"] = user_id[:8] + "_q_" + str(int(time.time()))
    ok = db.insert("quotations", data)
    return data if ok else None

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
    data["id"] = user_id[:8] + "_o_" + str(int(time.time()))
    ok = db.insert("orders", data)
    return data if ok else None

async def save_wishlist_item(user_id: str, name: str, url: str | None = None,
                              price_idr: int | None = None, source: str | None = None) -> dict | None:
    """Save a wishlist item to DB."""
    data = {
        "id": user_id[:8] + "_w_" + str(int(time.time())),
        "user_id": user_id,
        "emoji": "🛍️",
        "name": name[:200],
        "url": url or None,
        "price_idr": price_idr or None,
        "source": source or "telegram_bot",
        "note": "Dari Telegram Bot",
    }
    ok = db.insert("wishlist_items", data)
    return data if ok else None

async def save_price_alert(user_id: str, product: str, target_price: int,
                            url: str | None = None, current_price: int | None = None) -> dict | None:
    """Save a price alert to DB."""
    data = {
        "id": user_id[:8] + "_p_" + str(int(time.time())),
        "user_id": user_id,
        "product": product[:200],
        "url": url or None,
        "current_price": current_price or None,
        "target_price": target_price,
        "status": "monitoring",
    }
    ok = db.insert("price_alerts", data)
    return data if ok else None

async def fetch_cart_count(user_id: str) -> int:
    """Fetch the number of items in user's cart."""
    try:
        return db.count("cart_items", {"user_id": user_id})
    except:
        return 0

async def build_user_keyboard(chat_id: int, user_profile: dict | None = None) -> dict:
    """Build reply keyboard with dynamic cart count."""
    cart_label = "🛒 Cart"
    if user_profile:
        user_id = user_profile.get("id")
        if user_id:
            count = await fetch_cart_count(user_id)
            if count > 0:
                cart_label = f"🛒 Cart ({count})"
    return {
        "keyboard": [
            [{"text": "🔍 Cari Produk"}, {"text": "📦 Katalog"}],
            [{"text": "👤 Akun Saya"}, {"text": "📦 Pesanan"}],
            [{"text": "🧾 Tagihan"}, {"text": cart_label}],
            [{"text": "🚚 Jadwal"}, {"text": "📋 Wishlist"}],
            [{"text": "❓ Bantuan"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
    }

async def fetch_user_quotations(user_id: str, limit: int = 5) -> list:
    """Fetch user's quotations from DB."""
    try:
        return db.query("quotations", {"user_id": user_id}, order_by="created_at DESC", limit=limit)
    except Exception as e:
        log.error(f"fetch_quotations error: {e}")
        return []

async def fetch_user_orders(user_id: str, limit: int = 5) -> list:
    """Fetch user's orders from DB."""
    try:
        return db.query("orders", {"user_id": user_id}, order_by="created_at DESC", limit=limit)
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

SYSTEM_PROMPT = """Kamu adalah MyBagasi AI — asisten personal shopper Jepang yang **ramah, responsif, dan interaktif**. Bantu pelanggan Indonesia beli produk dari Jepang dengan pengalaman yang menyenangkan.

GAYA RESPON:
✅ **SINGKAT & TO THE POINT** — maksimal 3-4 kalimat
✅ **TAMPILKAN 1 PRODUK TERBAIK** — jangan tampilkan banyak alternatif
✅ **SERTAKAN CTA langsung** — "Ketik 'add to cart [nama]' atau 'beli sekarang'"
✅ **Pakai emoji secukupnya** biar hangat (👍, 📸, 💰, 🛒, ⚖️)
❌ **JANGAN tawarkan alternatif** (jangan "Mau cari yang lain?", "Coba kata kunci lain?")
❌ **JANGAN narasikan proses** (jangan "Saya cari dulu ya...")
❌ **JANGAN kasih tips edukasi** (jangan "Coba pakai kata kunci...")
❌ **JANGAN pakai sapaan** (jangan "Kak", "Bang", "Mas")

TUGAS KAMU (URUTAN WAJIB):
1️⃣ Cari produk di katalog MyBagasi dulu via search_catalog() — 119+ produk
2️⃣ Kalau gak ada, WAJIB cari di marketplace Jepang via search_products() — Rakuten, Amazon JP, Yahoo Shopping
3️⃣ **HANYA tampilkan 1 produk terbaik** (termurah/terbaru paling relevan)
4️⃣ Beri estimasi harga all-in (harga + fee + ongkir + pajak)
- ⛔ Hindari Yahoo Auction dan PayPay Flea Market (lelang/preloved) — Yahoo Shopping store tetap boleh ✅

ALUR PEMBELIAN (WAJIB DIKUASAI):
1. User cari produk → kamu tampilkan 1 produk + CTA
2. User bilang "add to cart" / "beli" / "masukkan" → **panggil add_to_cart() tool**
3. User bilang "checkout" / "bayar" / "lanjut" → **minta nama, email, no HP** → lalu panggil create_payment()
4. create_payment berhasil → kirim link invoice Mayar ke user: "✅ *Invoice siap!* Bayar di: [invoice_url]"

KETIKA TIDAK DITEMUKAN:
- **WAJIB** cari di marketplace (search_products) dulu — jangan langsung bilang tidak ditemukan
- Cukup bilang: "Tidak ditemukan produk untuk [keyword]." — langsung saja
- JANGAN tawarkan alternatif, JANGAN coba keyword lain, JANGAN minta share link

FORMAT JAWABAN (1 PRODUK SAJA):

*Nama Produk*
💰 JP¥X (Rp Y) | 🏪 Marketplace

Estimasi Biaya:
- Harga: Rp ...
- Fee Jasa: Rp ...
- Ongkir: Rp ... (kategori)
- Pajak: Rp ...
- 💰 **Total All-in: Rp ...**

🛒 Ketik "add to cart [nama]" untuk simpan
💳 Atau "beli [nama]" langsung checkout

LARANGAN: JANGAN tampilkan lebih dari 1 produk. JANGAN tawarkan alternatif. JANGAN sertakan ---KEYBOARD---, ---END KEYBOARD---, atau format keyboard apapun. Tombol ditambahkan otomatis oleh sistem.
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
    },
    {
        "type": "function",
        "function": {
            "name": "search_catalog",
            "description": "Cari produk di katalog referensi MyBagasi (119+ produk). Kategori: Fashion, Sepatu & Sandal, Jam Tangan, Skincare & Kosmetik, Kesehatan & Obat, Makanan & Minuman, Lainnya. Gunakan untuk rekomendasi produk tanpa perlu scrape live ke marketplace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "Kata kunci pencarian produk"},
                    "category": {"type": "string", "description": "Filter kategori (Fashion, Makeup, Sepatu, Gacha, Snack, Toys, Disney Store, Donqi Items)"}
                },
                "required": ["keyword"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_cart",
            "description": "Tambahkan produk ke keranjang belanja user. Panggil jika user meminta 'masukkan ke keranjang', 'add to cart', atau 'beli nanti'. Data akan tersimpan di keranjang MyBagasi dan bisa dilihat di dashboard web maupun bot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_name": {"type": "string", "description": "Nama produk (wajib)"},
                    "price_jpy": {"type": "integer", "description": "Harga dalam JPY (opsional)"},
                    "price_idr": {"type": "integer", "description": "Harga dalam IDR (opsional)"},
                    "url": {"type": "string", "description": "URL marketplace (opsional)"},
                    "image_url": {"type": "string", "description": "URL foto produk (opsional)"},
                    "category": {"type": "string", "description": "Kategori produk: Fashion, Makeup, Sepatu, Gacha, Snack, Toys, Disney Store, Donqi Items (opsional)"},
                    "quantity": {"type": "integer", "description": "Jumlah (default: 1)"},
                    "notes": {"type": "string", "description": "Catatan tambahan (opsional)"}
                },
                "required": ["product_name"]
            }
        }
    }
]

async def call_deepseek(messages: list[dict], with_tools: bool = True) -> dict:
    body = {
        "model": SUMOPOD_MODEL,
        "messages": messages,
        "max_tokens": 1500,
        "temperature": 0.7,
    }
    if with_tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                f"{SUMOPOD_BASE_URL}/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {SUMOPOD_API_KEY}"},
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
        
        # Save search results to product memory (fire-and-forget)
        if result.get("success") and result.get("items"):
            for item in result["items"]:
                try:
                    from datetime import datetime, timezone
                    item_weight, _ = _guess_weight(
                        item.get("title") or "",
                        item.get("price_jpy") or 0
                    )
                    item_name = item.get("title") or keyword
                    item_desc = item.get("description") or ""
                    item_keywords = keyword

                    # Auto-categorize if category is generic/incomplete
                    raw_category = item.get("category") or ""
                    if not raw_category or raw_category.lower() in ("general", "other", "lainnya", ""):
                        raw_category = auto_categorize(item_name, item_desc, item_keywords)

                    # Save image locally
                    imgs = item.get("images") or []
                    local_imgs = imgs
                    if imgs and imgs[0]:
                        local_img = await _save_memory_image(imgs[0], item.get("url") or "")
                        if local_img:
                            local_imgs = [local_img]

                    mem_data = {
                        "name": item_name,
                        "price_jpy": item.get("price_jpy") or 0,
                        "price_idr": round((item.get("price_jpy") or 0) * JPY_TO_IDR),
                        "marketplace": item.get("marketplace") or "Jepang",
                        "url": item.get("url") or "",
                        "category": raw_category,
                        "shipping_category": raw_category,
                        "weight_kg": item_weight,
                        "images": json.dumps(local_imgs),
                        "description": item_desc,
                        "source": "search",
                        "confidence": "medium",
                    }
                    db.save_product_memory(mem_data)
                except Exception as e:
                    log.warning(f"Failed to save to product memory: {e}")
        
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
        # Build custom_fields for bill tracking (will be saved to Supabase bills table)
        custom_fields = []
        if user_id:
            custom_fields.append({"key": "user_id", "value": user_id})
        if chat_id:
            custom_fields.append({"key": "telegram_id", "value": str(chat_id)})

        invoice_data = {
            "name": args.get("customer_name", ""),
            "email": args.get("customer_email", "contact@djiwatentram.com"),
            "mobile": args.get("customer_mobile", "081234567890"),
            "description": args.get("order_description", "Pembelian MyBagasi"),
            "items": args.get("items", []),
            "custom_field": custom_fields,
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

    # ─── search_catalog ──────────────────────────────────
    elif tool_name == "search_catalog":
        keyword = args.get("keyword", "")
        category = args.get("category", "")
        if not keyword:
            return json.dumps({"error": "Kata kunci diperlukan"})
        log.info(f"Tool: search_catalog '{keyword}' category='{category}'")

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                params = {"keyword": keyword, "limit": "10"}
                if category:
                    params["category"] = category
                r = await client.get(
                    f"{SCRAPER_URL}/catalog/search",
                    params=params,
                )
                if r.status_code == 200:
                    data = r.json()
                    items = data.get("items", [])
                else:
                    items = []

            result = {
                "success": True,
                "items": items,
                "total": len(items),
                "query": keyword,
            }

            # Kirim foto produk pertama jika ada
            if chat_id and items:
                first = items[0]
                images = first.get("images") or []
                if isinstance(images, list) and len(images) > 0:
                    img_url = images[0]
                elif isinstance(images, str):
                    img_url = images
                else:
                    img_url = ""
                if img_url:
                    name = (first.get("name") or "")[:60]
                    price = first.get("price_jpy", 0)
                    caption = (
                        f"📦 *{name}*\n"
                        f"💰 *JP¥{price:,}* | 📂 {first.get('category', '')}\n"
                        f"🔍 Ditemukan {len(items)} produk untuk \"{keyword}\""
                    )
                    await tg_send_photo(chat_id, img_url, caption)

            return json.dumps(result)
        except Exception as e:
            log.error(f"search_catalog error: {e}")
            return json.dumps({"success": False, "items": [], "error": str(e)})

    # ─── add_to_cart ────────────────────────────────────
    elif tool_name == "add_to_cart":
        if not user_id:
            return json.dumps({"error": "User belum terautentikasi"})
        product_name = args.get("product_name", "")
        if not product_name:
            return json.dumps({"error": "Nama produk diperlukan"})
        log.info(f"Tool: add_to_cart '{product_name[:40]}...'")

        cart_item = {
            "id": user_id[:8] + "_c_" + str(int(time.time())),
            "user_id": user_id,
            "product_name": product_name,
            "price_jpy": args.get("price_jpy", 0),
            "price_idr": args.get("price_idr", 0),
            "url": args.get("url", ""),
            "image_url": args.get("image_url", ""),
            "category": args.get("category", ""),
            "quantity": args.get("quantity", 1),
            "notes": args.get("notes", ""),
            "source": "telegram_bot",
        }
        try:
            if db.insert("cart_items", cart_item):
                log.info(f"Cart item saved: {product_name[:40]}")
                # Fetch updated cart count
                count = await fetch_cart_count(user_id)
                count_msg = f"({count} item di keranjang)"
                # Send notification + update keyboard
                if chat_id:
                    cart_short = product_name[:40]
                    user_profile = {"id": user_id}
                    user_kb = await build_user_keyboard(chat_id, user_profile)
                    await tg_send(chat_id,
                        f"✅ *{cart_short}* masuk keranjang! 🛒\n📦 *{count_msg}*\n\n"
                        f"🔍 Lihat cart: tap tombol di bawah 👇",
                        reply_markup=user_kb)
                return json.dumps({
                    "success": True,
                    "cart_count": count,
                    "message": f"✓ {product_name} sudah masuk keranjang! 🛒 ({count} item)\n\nCek & checkout: mybagasi.my.id/cart"
                })
            return json.dumps({"error": "Gagal menyimpan ke keranjang"})
        except Exception as e:
            log.error(f"add_to_cart error: {e}")
            return json.dumps({"error": "Gagal menyimpan ke keranjang"})

    return json.dumps({"error": f"Unknown tool: {tool_name}"})

async def ai_process(chat_id: int, user_message: str, user_profile: dict | None) -> str:
    """Process a user message through the AI agent loop with data persistence."""
    conv = _get_conv(chat_id)
    
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
    
    max_turns = 5  # Up to 4 tool rounds + 1 final response
    for turn in range(max_turns):
        # Update status sesuai turn
        status_texts = {
            0: "🔍 *Mencari produk...*",
            1: "🔄 *Mengecek harga & ketersediaan...*",
            2: "📊 *Menghitung estimasi biaya...*",
            3: "✍️ *Menyusun hasil...*",
            4: "⏳ *Finalizing...*",
        }
        status_ref[0] = status_texts.get(turn, "⏳ *Memproses...*")
        
        result = await call_deepseek(msgs, with_tools=True)
        
        if "error" in result:
            error_msg = "AI sedang bermasalah. Coba lagi ya."
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
                    
                    # Persist after each tool call
                    _save_conv(chat_id, conv["messages"], conv["context"],
                               user_id=conv["context"].get("user_id"))
                    
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
            ai_text = "Tidak bisa memproses permintaan itu. Coba kirim link produk atau kata kunci yang lebih spesifik."
            conv["messages"].append({"role": "assistant", "content": ai_text})
        
        # Persist after AI response
        _save_conv(chat_id, conv["messages"], conv["context"],
                   user_id=conv["context"].get("user_id"))
        
        # Stop timer — selesai
        if timer_task:
            timer_task.cancel()
        if status_msg_id:
            await tg_edit(chat_id, status_msg_id, f"✅ *Selesai!* (`{int(time.time() - start_time)}s`)")
        
        return ai_text
    
    fallback = "Waktu pencarian habis. Coba /reset lalu kirim ulang keyword yang lebih singkat."
    conv["messages"].append({"role": "assistant", "content": fallback})
    _save_conv(chat_id, conv["messages"], conv["context"],
               user_id=conv["context"].get("user_id"))
    
    # Stop timer
    if timer_task:
        timer_task.cancel()
    if status_msg_id:
        await tg_edit(chat_id, status_msg_id, f"⏰ *Time out* (`{int(time.time() - start_time)}s`)")
    
    return fallback

def reset_conversation(chat_id: int):
    _del_conv(chat_id)

# ── Command Handlers ───────────────────────────────────────

async def handle_start(chat_id: int, args: str):
    token = args.strip().upper()
    existing = await lookup_user_by_telegram_id(chat_id)
    
    if not token:
        if existing:
            # Refresh session (update last_active_at)
            await _update_last_active(chat_id)
            # Persistent reply keyboard with cart count badge
            reply_kb = await build_user_keyboard(chat_id, existing)
            # Inline keyboard di dalam pesan
            inline_kb = {
                "inline_keyboard": [
                    [{"text": "🔍 Cari Produk", "switch_inline_query_current_chat": ""}],
                    [{"text": "👤 Akun Saya", "callback_data": "/status"}, {"text": "📦 Pesanan", "callback_data": "/pesanan"}],
                    [{"text": "🧾 Tagihan", "callback_data": "/tagihan"}, {"text": "🛒 Cart", "callback_data": "/cart"}],
                    [{"text": "📦 Katalog", "callback_data": "/katalog"}, {"text": "🚚 Jadwal", "callback_data": "/jadwal"}],
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
        _save_conv(chat_id, [], {"user_id": user["id"]}, user_id=user["id"])
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
    
    msg += "📊 *Lihat semua:* mybagasi.my.id/profile\n"
    msg += "🔍 Ketik `/beli <produk>` untuk mulai belanja!"
    
    await tg_send(chat_id, msg)

async def handle_pesanan(chat_id: int):
    """Handle /pesanan — show user's orders from Supabase orders table."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus daftar/login dulu. Ketik `/register` atau `/login`.")
        return

    uid = user["id"]
    orders = await fetch_user_orders(uid, 10)

    if not orders:
        await tg_send(chat_id,
            "📦 *Pesanan* — Belum ada pesanan\n\n"
            "Yuk belanja dulu! Ketik `/beli <produk>`\n"
            "atau kirim link produk yang mau dibeli.")
        return

    msg = f"📦 *Pesanan ({len(orders)})*\n\n"
    for o in orders:
        status_emoji = {
            "draft": "📄",
            "waiting_payment": "🟡",
            "confirmed": "✅",
            "processing": "🔧",
            "shipped": "🚚",
            "delivered": "📬",
            "cancelled": "❌",
        }.get(o.get("status", ""), "❓")

        product = o.get("product", "")[:40]
        total = o.get("total", 0)
        created = ""
        if o.get("created_at"):
            created = o["created_at"][:10]

        msg += f"{status_emoji} *{o['status'].replace('_',' ').title()}*\n"
        msg += f"   {product}\n"
        msg += f"   💰 Rp {total:,}"
        if created:
            msg += f"  📅 {created}"
        msg += "\n\n"

    msg += "📊 Lihat lengkap: mybagasi.my.id/dashboard/orders"
    await tg_send(chat_id, msg)

async def handle_tagihan(chat_id: int):
    """Handle /tagihan — show user's bills from Supabase bills table."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus daftar/login dulu. Ketik `/register` atau `/login`.")
        return

    uid = user["id"]
    try:
        bills = db.query("bills", {"user_id": uid}, order_by="created_at DESC", limit=10)

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
    try:
        items = db.query("wishlist_items", {"user_id": uid}, order_by="created_at DESC", limit=10)
        
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


async def handle_cart(chat_id: int):
    """Handle Cart button — show user's cart items."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus daftar/login dulu. Ketik `/register` atau `/login`.")
        return

    uid = user["id"]
    try:
        items = db.query("cart_items", {"user_id": uid}, order_by="created_at DESC", limit=20)

        if not items:
            await tg_send(chat_id,
                "🛒 *Cart* — Kosong\n\n"
                "Belum ada barang di keranjang.\n"
                "Cari produk dulu dengan `/beli <keyword>`\n"
                "Lalu minta AI: *\"masukkan ke keranjang\"*")
            return

        total_jpy = sum(i.get("price_jpy", 0) * i.get("quantity", 1) for i in items)
        total_idr = sum(i.get("price_idr", 0) * i.get("quantity", 1) for i in items)
        msg = f"🛒 *Cart ({len(items)} item)* — Total: ¥{total_jpy:,}" + (f" | Rp{total_idr:,}" if total_idr else "") + "\n\n"

        for i, item in enumerate(items[:15], 1):
            name = (item.get("product_name") or "")[:40]
            qty = item.get("quantity", 1)
            price_jpy = item.get("price_jpy", 0)
            price_idr = item.get("price_idr", 0)
            cat = item.get("category") or ""
            notes = item.get("notes") or ""
            
            msg += f"{i}. *{name}*\n"
            msg += f"   {qty}× ¥{price_jpy:,}" + (f" (Rp{price_idr:,})" if price_idr else "") + "\n"
            if cat:
                msg += f"   📂 {cat}\n"
            if notes:
                msg += f"   📝 {notes[:30]}\n"

        msg += "\n📊 Lihat & checkout: mybagasi.my.id/cart"

        # Build inline keyboard with remove buttons per item + clear all
        inline_buttons = []
        for i, item in enumerate(items[:10], 1):
            item_id = item.get("id", "")
            name = (item.get("product_name") or "")[:25]
            inline_buttons.append([
                {"text": f"❌ Hapus #{i}: {name}", "callback_data": f"cart_remove_{item_id}"}
            ])
        if len(items) > 1:
            inline_buttons.append([
                {"text": "🗑️ Hapus Semua", "callback_data": "cart_clear"}
            ])
        inline_buttons.append([
            {"text": "🛒 Refresh Cart", "callback_data": "/cart"}
        ])
        inline_kb = {"inline_keyboard": inline_buttons}
        await tg_send(chat_id, msg, reply_markup=inline_kb)
    except Exception as e:
        log.error(f"cart fetch error: {e}")
        await tg_send(chat_id, "❌ Gagal mengambil keranjang. Coba lagi nanti.")


async def handle_cart_remove(chat_id: int, item_id: str):
    """Remove a specific item from the cart."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus login dulu.")
        return

    try:
        # Verify item exists
        item = db.get("cart_items", {"id": item_id})
        if not item:
            await tg_send(chat_id, "❌ Item tidak ditemukan di keranjang.")
            return

        # Delete
        db.delete("cart_items", {"id": item_id})

        product = item.get("product_name", "Produk")[:40]
        await tg_send(chat_id, f"🗑️ *{product}* dihapus dari keranjang.")
        log.info(f"Cart item removed: {item_id} for user {user['id'][:8]}")

        # Reshow cart
        await handle_cart(chat_id)
    except Exception as e:
        log.error(f"cart_remove error: {e}")
        await tg_send(chat_id, "❌ Gagal menghapus item. Coba lagi.")


async def handle_cart_clear(chat_id: int):
    """Clear all items from the cart."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Kamu harus login dulu.")
        return

    uid = user["id"]
    try:
        db.delete("cart_items", {"user_id": uid})
        await tg_send(chat_id, "🗑️ *Semua item* dihapus dari keranjang.")
        log.info(f"Cart cleared for user {uid[:8]}")

        # Refresh keyboard with updated cart count
        user_kb = await build_user_keyboard(chat_id, user)
        await tg_send(chat_id, "🛒 Keranjang sudah kosong.", reply_markup=user_kb)
    except Exception as e:
        log.error(f"cart_clear error: {e}")
        await tg_send(chat_id, "❌ Gagal menghapus keranjang. Coba lagi.")


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
        user_kb = await build_user_keyboard(chat_id, existing)
        await tg_send(chat_id,
            f"✅ Akun kamu (*{existing['name']}*) sudah terhubung!",
            reply_markup=user_kb)
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
        _save_conv(chat_id, [], {"user_id": user["id"]}, user_id=user["id"])
        user_kb = await build_user_keyboard(chat_id, user)
        await tg_send(chat_id,
            f"✅ *Verifikasi Berhasil!*\n\n"
            f"Selamat datang, *{user['name']}*! 🎉\n\n"
            f"Lanjutkan dengan mengirim kata kunci atau link produk!",
            reply_markup=user_kb)
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
            try:
                profile = db.get("profiles", {"id": user_id})
                if profile:
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
            _save_conv(chat_id, [], {"user_id": user_id}, user_id=user_id)
            # Build reply keyboard with cart count badge
            user_kb = await build_user_keyboard(chat_id, profile)
            await tg_send(chat_id,
                f"✅ *Akun MyBagasi berhasil dibuat!*\n\n"
                f"Selamat datang, *{state['name']}*! 🎉\n\n"
                f"*Kamu sudah bisa langsung mulai belanja:*\n"
                f"🔍 Kirim *kata kunci* — cari produk Jepang\n"
                f"🔗 Kirim *link marketplace* — cek harga\n"
                f"💳 Bayar via chat — checkout langsung\n"
                f"📋 `/wishlist` — lihat wishlist\n"
                f"📊 Dashboard: mybagasi.my.id/dashboard\n\n"
                f"💡 Contoh: ketik `onitsuka tiger`",
                reply_markup=user_kb)
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
                _save_conv(chat_id, [], {"user_id": state["user_id"]}, user_id=state["user_id"])
                login_profile = {"id": state["user_id"], "name": state["name"]}
                user_kb = await build_user_keyboard(chat_id, login_profile)
                await tg_send(chat_id,
                    f"✅ *Login Berhasil!*\n\n"
                    f"Selamat datang kembali, *{state['name']}*! 🎉\n\n"
                    f"Lanjutkan belanja dengan kirim kata kunci atau link produk!",
                    reply_markup=user_kb)
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
        "`/ai-cari <produk>` — 🤖 AI cari otomatis di browser\n"
        "`/katalog` — Jelajahi katalog produk\n"
        "`/jadwal` — 🚚 Jadwal pengiriman\n"
        "`/cart` — 🛒 Lihat keranjang belanja\n"
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

async def handle_katalog(chat_id: int, text: str):
    """
    Menampilkan daftar kategori katalog atau produk dari kategori tertentu.
    /katalog → daftar kategori dengan jumlah produk
    /katalog <nama> → 5 produk pertama dari kategori
    """
    parts = text.split(maxsplit=1)
    category_name = parts[1].strip() if len(parts) > 1 else ""

    if not category_name:
        # ── Show category list (via API) ──
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{SCRAPER_URL}/catalog/categories")
                if r.status_code != 200:
                    await tg_send(chat_id, "⚠️ Gagal memuat katalog. Coba lagi nanti.")
                    return
                data = r.json()
                categories = data.get("categories", [])
        except Exception as e:
            log.error(f"handle_katalog categories error: {e}")
            await tg_send(chat_id, "⚠️ Gagal memuat katalog. Coba lagi nanti.")
            return

        if not categories:
            await tg_send(chat_id, "📦 *Katalog* — Belum ada produk tersedia.")
            return

        icon_map = {
            "Fashion": "👕",
            "Sepatu & Sandal": "👟",
            "Jam Tangan": "⌚",
            "Skincare & Kosmetik": "💄",
            "Kesehatan & Obat": "💊",
            "Makanan & Minuman": "🍜",
            "Lainnya": "📦",
        }

        msg = "📦 *Katalog Produk MyBagasi*\n\n"
        for cat in categories:
            name = cat["name"]
            count = cat["count"]
            icon = icon_map.get(name, "📂")
            msg += f"{icon} *{name}* ({count} produk)\n"

        msg += "\nKetik `/katalog <nama kategori>` untuk lihat produk."

        # Inline keyboard
        inline_buttons = []
        for cat in categories[:6]:
            name = cat["name"]
            icon = icon_map.get(name, "📂")
            inline_buttons.append([{
                "text": f"{icon} Lihat {name}",
                "callback_data": f"/katalog {name}"
            }])
        inline_kb = {"inline_keyboard": inline_buttons}

        await tg_send(chat_id, msg, reply_markup=inline_kb)

    else:
        # ── Show products from specific category (via API) ──
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{SCRAPER_URL}/catalog/category",
                    params={"name": category_name, "limit": 5},
                )
                if r.status_code != 200:
                    await tg_send(chat_id, f"⚠️ Gagal memuat kategori {category_name}.")
                    return
                data = r.json()
                items = data.get("items", [])
        except Exception as e:
            log.error(f"handle_katalog category '{category_name}' error: {e}")
            await tg_send(chat_id, f"⚠️ Gagal memuat kategori {category_name}.")
            return

        if not items:
            await tg_send(chat_id, f"📦 *{category_name}* — Belum ada produk di kategori ini.")
            return

        # ── Send as photo album (media group) ──
        media_items = []
        text_items = []
        for item in items[:5]:
            images = item.get("images") or []
            img_url = ""
            if isinstance(images, list) and len(images) > 0:
                img_url = images[0]
            elif isinstance(images, str):
                img_url = images

            name = (item.get("name") or "")[:40]
            price = item.get("price_jpy", 0)
            weight = item.get("weight_kg") or 0
            caption = f"*{name}*"
            if price:
                caption += f"\n💰 JP¥{price:,}"
            if weight > 0:
                caption += f"\n⚖️ ~{weight:.2f} kg"

            if img_url and img_url.startswith(("http://", "https://", "/images/")):
                # Make relative paths absolute for Telegram
                if img_url.startswith("/"):
                    img_url = f"https://mybagasi.my.id{img_url}"
                media_items.append({
                    "type": "photo",
                    "media": img_url,
                    "caption": caption,
                    "parse_mode": "Markdown",
                })
                continue

            # No image — add to text list
            text_items.append(f"• *{name}*" + (f" — JP¥{price:,}" if price else ""))

        # Send album (max 10 per group)
        if media_items:
            for batch_start in range(0, len(media_items), 10):
                batch = media_items[batch_start:batch_start+10]
                try:
                    async with httpx.AsyncClient(timeout=15) as client:
                        await client.post(
                            tg_url("sendMediaGroup"),
                            json={
                                "chat_id": chat_id,
                                "media": batch,
                            },
                        )
                except Exception as e:
                    log.warning(f"sendMediaGroup error: {e}")

        # Send text-only items if any remain
        if text_items:
            await tg_send(chat_id, f"📦 *{category_name}* — {len(items)} produk:\n\n" + "\n".join(text_items))

        # Search tip
        await tg_send(chat_id, f"🔍 Cari produk lain dengan `/beli <keyword>`")


async def handle_jadwal(chat_id: int):
    """Handle Jadwal button — show active batch shipping schedules."""
    try:
        batches = db.query("batch_shipments", limit=5, order_by="departure_date ASC")

        if not batches:
            msg = (
                "🚚 *Jadwal Pengiriman* — Belum ada jadwal aktif\n\n"
                "Jadwal pengiriman gabungan (batch shipping) akan diumumkan "
                "saat ada keberangkatan baru.\n\n"
                "📊 Cek update: mybagasi.my.id/jadwal"
            )
            await tg_send(chat_id, msg)
            return

        direction_emoji = {
            "japan_to_indonesia": "🇯🇵→🇮🇩",
            "indonesia_to_japan": "🇮🇩→🇯🇵",
        }
        status_emoji = {
            "open": "🟢",
            "closing_soon": "🟡",
        }

        msg = "🚚 *Jadwal Pengiriman*\n\n"
        for b in batches:
            name = b.get("name", "Pengiriman")[:40]
            route = b.get("route", "")
            direction = direction_emoji.get(b.get("direction", ""), "🚚")
            status = status_emoji.get(b.get("status", ""), "❓")
            departure = (b.get("departure_date") or "")[:10]
            closes = (b.get("closes_at") or "")[:10]
            price = b.get("price_per_kg", 0)
            savings = b.get("savings_percent", 0)

            msg += f"{status} *{name}*\n"
            msg += f"   {direction} {route}\n"
            if departure:
                msg += f"   📅 Berangkat: {departure}\n"
            if closes:
                msg += f"   ⏰ Tutup: {closes}\n"
            msg += f"   💰 ¥{price:,}/kg (hemat {savings}%)\n\n"

        msg += "📊 Lihat & daftar: mybagasi.my.id/jadwal"
        await tg_send(chat_id, msg)
    except Exception as e:
        log.error(f"handle_jadwal error: {e}")
        await tg_send(chat_id,
            "🚚 *Jadwal Pengiriman*\n\n"
            "Gagal memuat jadwal. Coba lagi nanti.\n\n"
            "📊 Cek langsung: mybagasi.my.id/jadwal")


def detect_product_buttons(text: str, multi_button: bool = False) -> dict | None:
    """Auto-detect products in AI response and generate inline keyboard.
    
    Detects numbered products (1 — Nama Produk, 2 — Nama Produk) or product indicators.
    Returns reply_markup dict or None if no products detected.
    """
    t = (text or "").strip()
    t_upper = t.upper()
    lines = t.split('\n')
    
    # ── 1. Cek "tidak ditemukan" ──
    not_found_words = ["tidak ditemukan", "tidak ketemu", "tidak ada hasil", "tidak tersedia", 
                       "tidak dapat menemukan", "gagal", "tidak bisa memproses", "tidak berhasil"]
    is_not_found = any(kw in t.lower() for kw in not_found_words)
    if is_not_found:
        return {
            "inline_keyboard": [
                [{"text": "🔍 Cari Lagi", "switch_inline_query_current_chat": ""}],
                [{"text": "📖 Bantuan", "callback_data": "/help"}],
            ]
        }
    
    # ── 2. Cari produk bernomor ──
    product_indices = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Match: "1 — Product", "1. Product", "1 —Product"
        m = re.match(r'^(\d+)\s*[—\-\.]\s*(.+)', stripped)
        if m:
            num = int(m.group(1))
            name = m.group(2).strip()
            # Skip kalau judul section (bukan produk)
            if name and len(name) > 3 and not name.startswith(('RINCIAN', 'TOTAL', 'Harga', 'Estimasi')):
                product_indices.append((num, name, i))
    
    # Kalau ada produk bernomor
    if product_indices:
        top_products = product_indices[:5]
        buttons = []
        for num, name, _ in top_products:
            short_name = name[:30] if len(name) > 30 else name
            buttons.append([
                {"text": f"🛒 Produk {num}: {short_name}", "callback_data": f"cart_{num}"}
            ])
        # Action buttons
        buttons.append([
            {"text": "💳 Beli Semua", "callback_data": "cart_buy_all"},
            {"text": "❌ Lewati", "callback_data": "cart_skip"}
        ])
        return {"inline_keyboard": buttons}
    
    # ── 3. Deteksi indikator produk (clean format, no emoji) ──
    has_product = False
    indicators = [
        'Harga: JPY', 'Harga: Rp', 'Total All-in:', 'Estimasi Biaya:',
        'harga produk: Rp', 'fee jasa: Rp', 'ongkir: Rp', 'pajak: Rp',
        'total all-in: Rp', 'JPY', 'Rp.', 'all-in:',
    ]
    for kw in indicators:
        if kw.lower() in t.lower():
            has_product = True
            break
    
    if not has_product:
        # Cek pola harga seperti "Rp1.500.000" atau "JPY 12,000"
        if re.search(r'Rp\s?[\d.,]+', t) or re.search(r'JPY\s?[\d.,]+', t):
            has_product = True
    
    if has_product:
        return {
            "inline_keyboard": [
                [{"text": "🛒 Tambah ke Cart", "callback_data": "cart_add"}],
                [{"text": "💳 Beli Langsung", "callback_data": "cart_buy"}, {"text": "❌ Lewati", "callback_data": "cart_skip"}],
            ]
        }
    
    # ── 4. Deteksi pertanyaan dari AI ──
    question_words = ["mau cari", "mau beli", "ingin cari", "produk lain", "lainnya?", "spesifik?", "apa lagi"]
    is_question = any(kw in t.lower() for kw in question_words)
    if is_question:
        return {
            "inline_keyboard": [
                [{"text": "🔍 Cari Produk", "switch_inline_query_current_chat": ""}],
                [{"text": "📖 Bantuan", "callback_data": "/help"}],
            ]
        }
    
    return None



# ═══════════════════════════════════
# Browser Interactive Browsing
# ═══════════════════════════════════

async def handle_browse(chat_id: int, url: str):
    """Open a URL in the user's browser session."""
    if not url:
        await tg_send(chat_id, 
            "🌐 *Browser*\n\n"
            "Gunakan: `/browse <url>`\n"
            "Contoh: `/browse https://amazon.co.jp`\n\n"
            "Setelah terbuka, gunakan `/snap` untuk lihat elemen interaktif.")
        return

    status_msg = await tg_send(chat_id, f"🌐 *Membuka:* {url[:50]}...")
    msg_id = status_msg["result"]["message_id"] if status_msg and status_msg.get("ok") else None
    
    await tg_typing(chat_id)
    result = await browser.navigate(chat_id, url)
    
    if result.get("success"):
        elements = result.get("interactive_elements", [])
        title = result.get("title", "")[:80]
        count = result.get("element_count", 0)
        
        msg = (
            f"🌐 *{title}*\n"
            f"🔗 `{result['url']}`\n"
            f"📋 Elemen interaktif: *{count}*\n\n"
            f"Gunakan:\n"
            f"• `/snap` — lihat semua elemen\n"
            f"• `/screenshot` — tangkap layar\n"
            f"• `/click @e1` — klik elemen\n"
            f"• `/type @e5 teks` — ketik\n"
            f"• `/scroll down` — scroll"
        )
        if msg_id:
            await tg_edit(chat_id, msg_id, msg)
        else:
            await tg_send(chat_id, msg)
    else:
        err = result.get("error", "Unknown error")
        error_msg = f"❌ *Gagal membuka halaman*\n\n{err}"
        if msg_id:
            await tg_edit(chat_id, msg_id, error_msg)
        else:
            await tg_send(chat_id, error_msg)


async def handle_bclick(chat_id: int, selector: str):
    """Click an element by @ref or text."""
    if not selector:
        await tg_send(chat_id,
            "🖱️ *Click*\n\n"
            "Gunakan: `/click @e1` (ref dari `/snap`)\n"
            "Atau: `/click Cari` (text match)")
        return
    
    await tg_typing(chat_id)
    result = await browser.click_element(chat_id, selector)
    
    if result.get("success"):
        target = result.get("target", selector)
        new_url = result.get("url", "")
        msg = f"🖱️ *Klik:* {target}\n"
        if new_url:
            msg += f"📍 URL: `{new_url[:80]}`"
        await tg_send(chat_id, msg)
    else:
        await tg_send(chat_id, f"❌ *Click gagal*\n\n{result.get('error', 'Elemen tidak ditemukan')}")


async def handle_btype(chat_id: int, args: str):
    """Type text into an input field."""
    if not args or " " not in args:
        await tg_send(chat_id,
            "⌨️ *Type*\n\n"
            "Gunakan: `/type @e5 teks yang ingin diketik`\n"
            "Contoh: `/type @e3 hoodie`")
        return
    
    parts = args.split(maxsplit=1)
    selector = parts[0]
    text = parts[1]
    
    await tg_typing(chat_id)
    result = await browser.type_text(chat_id, selector, text)
    
    if result.get("success"):
        target = result.get("target", selector)
        length = result.get("text_length", 0)
        await tg_send(chat_id, f"⌨️ *Diketik:* {target}\n📝 `{length}` karakter")
    else:
        await tg_send(chat_id, f"❌ *Type gagal*\n\n{result.get('error', 'Input tidak ditemukan')}")


async def handle_bscroll(chat_id: int, direction: str = "down"):
    """Scroll the page."""
    if direction not in ("down", "up"):
        direction = "down"
    
    await tg_typing(chat_id)
    result = await browser.scroll_page(chat_id, direction)
    
    if result.get("success"):
        pct = result.get("scroll_pct", 0)
        await tg_send(chat_id, f"📜 *Scroll {direction}* — posisi: ~{pct}%")
    else:
        await tg_send(chat_id, f"❌ *Scroll gagal*\n\n{result.get('error')}")


async def handle_bscreenshot(chat_id: int):
    """Take a screenshot and send it to Telegram."""
    await tg_typing(chat_id)
    result = await browser.take_screenshot(chat_id)
    
    if result.get("success"):
        filepath = result["filepath"]
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                with open(filepath, "rb") as f:
                    r = await client.post(
                        tg_url("sendPhoto"),
                        data={"chat_id": chat_id},
                        files={"photo": f},
                    )
                    if r.status_code == 200:
                        return
            await tg_send(chat_id, f"📸 *Screenshot siap*\nPath: `{filepath}`")
        except Exception as e:
            await tg_send(chat_id, f"📸 Screenshot diambil\n`{filepath}`")
    else:
        await tg_send(chat_id, f"❌ *Screenshot gagal*\n\n{result.get('error')}")


async def handle_bsnap(chat_id: int):
    """Show interactive elements of the current page."""
    await tg_typing(chat_id)
    result = await browser.snapshot(chat_id)
    
    if not result.get("success"):
        await tg_send(chat_id, f"❌ {result.get('error', 'Belum ada halaman yang dibuka. Gunakan /browse <url>')}")
        return
    
    title = result.get("title", "")[:60]
    url = result.get("url", "")
    elements = result.get("interactive_elements", [])
    text_preview = result.get("text_preview", "")
    
    msg_lines = [f"📋 *{title}*", f"🔗 `{url[:60]}`", ""]
    
    if elements:
        shown = 0
        for el in elements[:25]:
            desc = el.get("desc", "")
            if desc:
                msg_lines.append(f"`{desc}`")
                shown += 1
        if len(elements) > 25:
            msg_lines.append(f"*... +{len(elements) - 25} elemen lagi (total {len(elements)})*")
    else:
        msg_lines.append("_Tidak ada elemen interaktif terdeteksi_")
    
    if len(elements) <= 10 and text_preview:
        preview = text_preview[:500]
        msg_lines.extend(["", "📄 *Teks halaman:*", f"```\n{preview}\n```"])
    
    msg_lines.append("")
    msg_lines.append("💡 `/click @e1` untuk klik elemen")
    
    msg = "\n".join(msg_lines)
    
    if len(msg) > 4000:
        short_msg = (
            f"📋 *{title}*\n"
            f"🔗 `{url[:60]}`\n"
            f"Elemen: *{len(elements)}*\n"
            f"Halaman terlalu panjang. Fitur akan di-improve."
        )
        await tg_send(chat_id, short_msg)
    else:
        await tg_send(chat_id, msg)


async def handle_bclose(chat_id: int):
    """Close the user's browser session."""
    result = await browser.close_session(chat_id)
    await tg_send(chat_id, "🚫 *Browser session ditutup*\n\nGunakan `/browse <url>` untuk mulai lagi.")


# ═══════════════════════════════════
# AI-Driven Browser (like Hermes)
# ═══════════════════════════════════

BROWSE_VISION_PROMPT = """You are a browser automation agent for Japanese e-commerce.

GOAL: {goal}

You are browsing a Japanese shopping site. You receive:
1. A SCREENSHOT of the current page (visible to you)
2. Page text content
3. Interactive elements with ref IDs
4. Browsing history

Your job: Analyze what you see and decide the NEXT action.

IMPORTANT RULES:
- If you see a search/input box, TYPE the search keyword and SUBMIT
- If you see product results matching the goal, CLICK on the most relevant product
- If you see a product detail page with price matching the goal, say "done"
- Handle cookie popups, language selectors, or CAPTCHAs first
- If the page didn't load properly, try navigating again
- Be decisive — don't waste steps
- Prefer Japanese Rakuten/Amazon sites

Return ONLY a JSON object (no markdown, no code fences):

1. If goal achieved (product found with price):
   {{"action": "done", "reason": "Brief reason", "summary": "Product description", "product_name": "Product name", "product_price": "Price info"}}

2. If need to navigate to a different URL:
   {{"action": "navigate", "reason": "Why", "url": "https://..."}}

3. If need to click an element:
   {{"action": "click", "reason": "Why", "selector": "@1" or "text to find"}}

4. If need to type in search box:
   {{"action": "type", "reason": "Why", "selector": "@2" or "search", "text": "search keywords"}}

5. If need to submit a search form (press Enter):
   {{"action": "submit", "reason": "Why"}}

6. If need to scroll:
   {{"action": "scroll", "reason": "Why", "direction": "down" or "up"}}

CURRENT STEP: {step}/{max_steps}
PREVIOUS ACTIONS: {history_str}
PAGE TITLE: {title}
PAGE URL: {url}"""


async def call_ai_browse_vision(
    screenshot_b64: str,
    page_text: str,
    elements: list,
    goal: str,
    url: str,
    title: str,
    history: list,
    step: int,
    max_steps: int,
) -> dict | None:
    """Call Gemini Vision (via Sumopod) to decide next browsing action."""
    import re as _re
    # Build history string
    history_str = "; ".join(
        f"step {h.get('step','?')}: {h.get('action','?')} — {h.get('reason','')[:50]}"
        for h in history[-5:]  # Last 5 steps
    ) or "Just started"
    
    prompt = BROWSE_VISION_PROMPT.format(
        goal=goal,
        step=step,
        max_steps=max_steps,
        history_str=history_str,
        title=title[:100],
        url=url[:150],
    )
    
    # Truncate page text if too long for token budget
    text_preview = page_text[:2000] if page_text else ""
    
    # Build element summary
    elem_str = "; ".join(
        f"@{e.get('ref','?')}={e.get('tag','')}:{e.get('text','')[:40]}"
        for e in (elements or [])[:20]
    )
    
    # Prepare messages with vision
    messages = [
        {
            "role": "system",
            "content": prompt,
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f"Current page content:\n\n{text_preview[:1500]}\n\nInteractive elements: {elem_str[:500]}\n\nWhat should I do next?",
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{screenshot_b64}",
                    },
                },
            ],
        },
    ]
    
    body = {
        "model": SUMOPOD_MODEL,
        "messages": messages,
        "max_tokens": 500,
        "temperature": 0.3,
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{SUMOPOD_BASE_URL}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {SUMOPOD_API_KEY}",
                },
                json=body,
            )
            if r.status_code != 200:
                log.error(f"Vision API error {r.status_code}: {r.text[:200]}")
                return None
            
            data = r.json()
            content = data["choices"][0]["message"]["content"]
            
            # Extract JSON from response (handle markdown code fences)
            json_match = _re.search(r'({[\s\S]*"action"[\s\S]*})', content)
            if json_match:
                return json.loads(json_match.group(1))
            
            # Try direct parse
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                log.error(f"Vision returned non-JSON: {content[:200]}")
                return None
                
    except Exception as e:
        log.error(f"Vision call error: {e}")
        return None


async def handle_ai_cari(chat_id: int, goal: str):
    """AI-driven browser: find product via automated browsing."""
    if not SUMOPOD_API_KEY:
        await tg_send(chat_id, "❌ AI Browser belum dikonfigurasi.")
        return
    
    if not goal:
        await tg_send(chat_id,
            "🤖 *AI Browser*\n\n"
            "Gunakan: `/ai-cari <produk>`\n"
            "Contoh: `/ai-cari Onitsuka Tiger Mexico 66`\n\n"
            "Bot akan otomatis browsing ke marketplace Jepang, "
            "cari produk, screenshot, analisis pakai AI, "
            "sampai ketemu hasilnya.")
        return
    
    # Send initial status
    status_msg = await tg_send(chat_id, f"🤖 *AI Browser* — mencari \"{goal}\"\n⏳ Memulai...")
    msg_id = status_msg["result"]["message_id"] if status_msg and status_msg.get("ok") else None
    
    async def update_status(text: str):
        if msg_id:
            await tg_edit(chat_id, msg_id, text)
    
    await update_status(f"🤖 *Mencari:* \"{goal}\"\n🌐 Membuka halaman...")
    
    # Run AI browse
    result = await browser.ai_browse(
        chat_id=chat_id,
        goal=goal,
        vision_fn=call_ai_browse_vision,
        max_steps=10,
        status_fn=update_status,
    )
    
    if result.get("success"):
        summary = result.get("summary", "")
        product_name = result.get("product_name", "")
        product_price = result.get("product_price", "")
        product_url = result.get("product_url", "")
        steps = result.get("steps", 0)
        
        # Take a final screenshot to show the user
        ss_filepath = None
        try:
            ss = await browser.take_screenshot(chat_id)
            if ss.get("success"):
                ss_filepath = ss.get("filepath")
        except:
            pass
        
        msg = (
            f"✅ *Produk Ditemukan!* ({steps} langkah)\n\n"
            f"📦 *{product_name or summary[:80]}*\n"
        )
        if product_price:
            msg += f"💰 {product_price}\n"
        if product_url:
            msg += f"🔗 {product_url}\n"
        msg += f"\n{summary[:500]}"
        
        if msg_id:
            # Send final result as new message (don't edit the status)
            await tg_edit(chat_id, msg_id, "✅ *Selesai!*")
        
        # Send screenshot if available
        if ss_filepath:
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    with open(ss_filepath, "rb") as f:
                        await client.post(
                            tg_url("sendPhoto"),
                            data={"chat_id": chat_id, "caption": msg, "parse_mode": "Markdown"},
                            files={"photo": f},
                        )
            except:
                await tg_send(chat_id, msg)
        else:
            await tg_send(chat_id, msg)
        
        # Clean up browser session after done
        await browser.close_session(chat_id)
        
    else:
        error = result.get("error", "Gagal")
        last_url = result.get("last_url", "")
        history = result.get("history", [])
        
        # Get last screenshot for debugging
        ss_filepath = None
        try:
            ss = await browser.take_screenshot(chat_id)
            if ss.get("success"):
                ss_filepath = ss.get("filepath")
        except:
            pass
        
        error_msg = (
            f"❌ *Tidak ditemukan*\n\n"
            f"{error}\n"
        )
        if last_url:
            error_msg += f"\nHalaman terakhir: {last_url}"
        
        if msg_id:
            await tg_edit(chat_id, msg_id, error_msg)
        
        # Send last screenshot if available
        if ss_filepath:
            caption = f"📸 *Screenshot terakhir* — cari \"{goal}\"\n{error}\n`{last_url}`"
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    with open(ss_filepath, "rb") as f:
                        await client.post(
                            tg_url("sendPhoto"),
                            data={"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"},
                            files={"photo": f},
                        )
            except:
                pass
        
        # Clean up
        await browser.close_session(chat_id)


async def handle_ai(chat_id: int, text: str, user_profile: dict | None):
    if not SUMOPOD_API_KEY:
        await tg_send(chat_id, "❌ AI Personal Shopper belum dikonfigurasi.")
        return
    await tg_typing(chat_id)
    response = await ai_process(chat_id, text, user_profile)
    
    # Bersihkan response dari marker-marker
    clean_text = re.sub(r'---PHOTO:https?://[^\s]+---\n?', '', response).strip()
    clean_text = re.sub(r'\n?---KEYBOARD---.*?---END KEYBOARD---\n?', '', clean_text, flags=re.DOTALL).strip()
    
    if not clean_text:
        clean_text = "Ada error. Coba lagi ya."
    
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

async def _save_memory_image(img_url: str, product_url: str = "") -> str | None:
    """Download image from URL and save to catalog references directory.
    Returns local relative path like /images/references/memory/{id}.jpg or None."""
    if not img_url or img_url.startswith("/images/references/"):
        return None  # Already local
    if not img_url:
        return None
    import hashlib
    try:
        # Create directory
        mem_dir = "/opt/mybagasi/public/images/references/memory"
        os.makedirs(mem_dir, exist_ok=True)

        # Generate unique filename based on URL
        url_hash = hashlib.md5((img_url + product_url).encode()).hexdigest()[:12]
        ext = ".jpg"
        if "png" in img_url.lower():
            ext = ".png"
        elif "webp" in img_url.lower():
            ext = ".webp"
        local_path = f"{mem_dir}/{url_hash}{ext}"

        # Skip if already cached
        if os.path.exists(local_path):
            return f"/images/references/memory/{url_hash}{ext}"

        # Download
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(img_url)
            if r.status_code == 200 and len(r.content) > 1000:
                with open(local_path, "wb") as f:
                    f.write(r.content)
                log.info(f"Saved memory image: {local_path}")
                return f"/images/references/memory/{url_hash}{ext}"
        return None
    except Exception as e:
        log.warning(f"Save memory image error: {e}")
        return None


# ── Handle Photo Messages ───────────────────────────────────

# Estimated weight per category (from shipping rates)
CATEGORY_WEIGHT = {
    "fashion": 0.5, "sepatu": 0.5, "pakaian": 0.5,
    "elektronik": 0.5, "gadget": 0.5, "kamera": 0.5,
    "skincare": 0.3, "makeup": 0.3, "kosmetik": 0.3,
    "buku": 0.3, "majalah": 0.3,
    "food": 0.5, "snack": 0.5, "minuman": 0.5,
    "gacha": 0.2, "toys": 0.4, "boneka": 0.4,
    "general": 0.5,
}

def _guess_weight(title: str, price_jpy: int = 0) -> tuple[float, str]:
    """Guess weight in kg based on product title keywords."""
    title_lower = title.lower()
    for cat, weight in CATEGORY_WEIGHT.items():
        if cat in title_lower:
            return weight, cat
    # Fallback: heavier if price > 20000 yen (more premium product)
    if price_jpy > 20000:
        return 1.0, "general (premium)"
    return 0.5, "general"

async def handle_photo(chat_id: int, file_id: str):
    """Download photo, analyze with Gemini Vision, then search & return price in JPY + IDR."""
    try:
        # 1. Get file path from Telegram
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(tg_url("getFile"), params={"file_id": file_id})
            if r.status_code != 200:
                await tg_send(chat_id, "❌ Gagal membaca foto. Coba kirim ulang.")
                return
            file_path = r.json()["result"]["file_path"]

        # 2. Download the file
        file_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(file_url)
            if r.status_code != 200:
                await tg_send(chat_id, "❌ Gagal mengunduh foto.")
                return
            img_bytes = r.content

        await tg_send(chat_id, "👀 *Menganalisis gambar & mencari harga...*")

        # 3. Encode as base64 for Gemini Vision
        b64 = base64.b64encode(img_bytes).decode("utf-8")

        # 4. Gemini Vision — identify product + generate search keywords
        body = {
            "model": SUMOPOD_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "Kamu adalah asisten belanja Jepang. Lihat foto produk ini. "
                               "Jika ada tulisan Jepang di foto, BACA dan TERJEMAHKAN ke Indonesia. "
                               "Return ONLY a JSON object with keys: "
                               "product_name (nama produk dalam Indonesia/Inggris), "
                               "japanese_name (nama asli dalam bahasa Jepang jika ada, kosong jika tidak), "
                               "japanese_text (teks Jepang yang terbaca di foto, terjemahan Indonesianya), "
                               "brand (merek), "
                               "category (fashion/elektronik/skincare/buku/food/gacha/toys/general), "
                               "search_keywords (3-5 kata kunci untuk cari produk ini di marketplace Jepang, pakai nama Jepang asli jika ada, dipisah koma). "
                               "Contoh: {\"product_name\":\"Onitsuka Tiger Mexico 66\",\"japanese_name\":\"オニツカタイガー メキシコ66\","
                               "\"japanese_text\":\"オニツカタイガー → Onitsuka Tiger, メキシコ66 → Mexico 66\","
                               "\"brand\":\"Onitsuka Tiger\",\"category\":\"fashion\","
                               "\"search_keywords\":\"Onitsuka Tiger Mexico 66, オニツカタイガー メキシコ66, sepatu kasual\"}",
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Apa produk di foto ini?"},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                        },
                    ],
                },
            ],
            "max_tokens": 300,
            "temperature": 0.1,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{SUMOPOD_BASE_URL}/chat/completions",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {SUMOPOD_API_KEY}",
                },
            )
            if r.status_code != 200:
                await tg_send(chat_id, "🔍 Produk terdeteksi. Ketik nama produknya buat saya cariin harga dari Jepang!")
                return

            data = r.json()
            vision_text = data["choices"][0]["message"]["content"]

        # 5. Parse the JSON from Gemini
        import re as _re
        json_match = _re.search(r'(\{[\s\S]*"product_name"[\s\S]*\})', vision_text)
        name_jp = ""
        if not json_match:
            # Fallback: clean the vision text to remove JSON artifacts
            raw = vision_text.strip()
            # Remove markdown code fences if any
            raw = _re.sub(r'```(?:json)?\s*', '', raw).strip()
            # Remove leading/trailing braces that look like partial JSON
            raw = _re.sub(r'^\{[\s\S]*?"product_name"\s*:\s*"', '', raw)
            raw = _re.sub(r'"[^}]*\}', '', raw)
            product_name = raw[:60].strip() or "Produk dari foto"
            search_kw = product_name
            category = "general"
        else:
            try:
                info = json.loads(json_match.group(1))
                product_name = info.get("product_name", "").strip() or "Produk dari foto"
                search_kw = info.get("search_keywords", product_name).strip()
                category = info.get("category", "general").lower()
                # Extra safety: clean product_name from any JSON artifacts
                product_name = product_name.replace('"', '').replace('{', '').replace('}', '')
            except json.JSONDecodeError:
                raw = vision_text.strip()
                raw = _re.sub(r'```(?:json)?\s*', '', raw).strip()
                raw = _re.sub(r'^\{[\s\S]*?"product_name"\s*:\s*"', '', raw)
                raw = _re.sub(r'"[^}]*\}', '', raw)
                product_name = raw[:60].strip() or "Produk dari foto"
                search_kw = product_name
                category = "general"

        # 6. Search via scraper API
        await tg_send(chat_id, f"🔍 *{product_name}* — mencari harga di marketplace Jepang...")

        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(f"{SCRAPER_URL}/search", json={"keyword": search_kw, "limit": 3})
            if r.status_code != 200:
                await tg_send(chat_id, f"📸 *{product_name}*\nGak nemu harga online. Coba ketik manual nama produknya.")
                return
            search_data = r.json()

        items = search_data.get("items", [])
        if not items:
            await tg_send(chat_id, f"📸 *{product_name}*\nGak nemu harga online. Coba ketik manual nama produknya.")
            return

        # 7. Format results with price + weight
        rate = 113  # Kurs dari user
        lines = [f"📸 *{product_name}*\n"]

        # Add Japanese translation if available
        try:
            if info.get("japanese_text"):
                lines.append(f"   🇯🇵 *Terjemahan:* {info['japanese_text']}\n")
            elif info.get("japanese_name"):
                lines.append(f"   🇯🇵 *Nama Jepang:* {info['japanese_name']}\n")
        except NameError:
            pass  # info variable not available in fallback path

        for i, item in enumerate(items[:3]):
            title = (item.get("title") or "").strip() or "Produk"
            price_jpy = item.get("price_jpy")
            marketplace = item.get("marketplace", "Jepang") or "Jepang"
            url = item.get("url", "")
            img_url = ""
            imgs = item.get("images") or []
            if imgs:
                img_url = imgs[0]

            # Price conversion
            if price_jpy and price_jpy > 0:
                price_idr = round(price_jpy * rate)
                display_jpy = f"¥{price_jpy:,}"
                display_idr = f"Rp{price_idr:,}".replace(",", ".")
            else:
                price_display = item.get("price_display", "") or ""
                display_jpy = price_display if price_display else "?"
                display_idr = "?"
                price_jpy = 0

            # Weight estimate
            weight, _ = _guess_weight(title, price_jpy or 0)

            emoji_map = {0: "1️⃣", 1: "2️⃣", 2: "3️⃣"}
            emoji = emoji_map.get(i, "•")

            lines.append(
                f"{emoji} *{title[:50]}*\n"
                f"   💰 {display_jpy} ≈ *{display_idr}*\n"
                f"   ⚖️ ~{weight:.1f} kg | 🏪 {marketplace}\n"
            )
            if url:
                lines.append(f"   🔗 [Lihat Produk]({url})\n")

        # Total row
        total_jpy = sum(item.get("price_jpy") or 0 for item in items[:3] if item.get("price_jpy"))
        total_idr = round(total_jpy * rate)
        lines.append(
            f"━━━━━━━━━━━━━━━━━\n"
            f"💰 Kurs: Rp{rate:,} | ⚖️ Estimasi berat per kategori\n"
            f"💵 Total: ≈ *Rp{total_idr:,}* (¥{total_jpy:,})\n".replace(",", ".")
        )

        # Send photo first if available, then text
        first_item = items[0]
        first_img = ""
        imgs = first_item.get("images") or []
        if imgs:
            first_img = imgs[0]

        full_text = "".join(lines)
        if first_img:
            await tg_send_photo(chat_id, first_img, f"📸 *{product_name}* — hasil pencarian:", reply_markup={
                "inline_keyboard": [[{"text": "🛒 Mau Beli?", "callback_data": f"cart_add:{items[0].get('url','')}"}]]
            })
            await tg_send(chat_id, full_text)
        else:
            await tg_send(chat_id, full_text)

        # ── Save all results to product memory ──
        for item in items:
            try:
                item_weight, _ = _guess_weight(
                    item.get("title") or item.get("name") or "",
                    item.get("price_jpy") or 0
                )
                item_name = item.get("title") or item.get("name") or product_name
                item_desc = item.get("description") or ""

                # Auto-categorize if category is empty or generic
                raw_category = category or ""
                if not raw_category or raw_category.lower() in ("general", "other", "lainnya", ""):
                    raw_category = auto_categorize(item_name, item_desc, product_name)

                mem_data = {
                    "name": item_name,
                    "name_jp": name_jp if item is items[0] else "",
                    "price_jpy": item.get("price_jpy") or 0,
                    "price_idr": round((item.get("price_jpy") or 0) * 113),
                    "marketplace": item.get("marketplace") or "Jepang",
                    "url": item.get("url") or "",
                    "category": raw_category,
                    "shipping_category": raw_category,
                    "weight_kg": item_weight,
                    "images": json.dumps(item.get("images") or []),
                    "description": item_desc,
                    "source": "photo",
                    "confidence": "medium",
                }
                # Save image locally if URL exists
                imgs = item.get("images") or []
                if imgs and imgs[0]:
                    local_img = await _save_memory_image(imgs[0], mem_data.get("url", ""))
                    if local_img:
                        mem_data["images"] = json.dumps([local_img])
                db.save_product_memory(mem_data)
            except Exception as e:
                log.warning(f"Failed to save to product memory: {e}")

    except Exception as e:
        log.error(f"handle_photo error: {e}")
        await tg_send(chat_id, "📸 Foto diterima! Ketik nama produknya biar saya cariin dari Jepang.")


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
        elif data == "/cart":
            await handle_cart(chat_id)
        elif data == "/status":
            await handle_status(chat_id)
        elif data == "/pesanan":
            await handle_pesanan(chat_id)
        elif data == "/tagihan":
            await handle_tagihan(chat_id)
        elif data == "/help":
            await handle_help(chat_id)
        elif data.startswith("/katalog"):
            # Handle /katalog callback with optional category name
            cmd_parts = data.split(maxsplit=1)
            cb_args = cmd_parts[1] if len(cmd_parts) > 1 else ""
            await handle_katalog(chat_id, f"/katalog {cb_args}")
        elif data == "/jadwal":
            await handle_jadwal(chat_id)
        elif data.startswith("cart_"):
            action = data.replace("cart_", "")
            if action == "add" or data == "cart_add":
                # "cart_add" (bare button) or "cart_add:URL"
                user = await lookup_user_by_telegram_id(chat_id)
                if not user:
                    await tg_send(chat_id, "⚠️ Kamu harus daftar/login dulu. Ketik /register")
                    return
                uid = user["id"]

                # Parse product info from message
                msg_text = callback.get("message", {}).get("text") or callback.get("message", {}).get("caption") or ""
                prod_match = re.search(r'\*\*(.+?)\*\*', msg_text)
                product_name = prod_match.group(1).strip() if prod_match else "Produk dari bot"

                from datetime import datetime, timezone
                cart_item = {
                    "id": uid[:8] + "_c_" + str(int(time.time())),
                    "user_id": uid,
                    "product_name": product_name[:40],
                    "price_jpy": 0, "price_idr": 0,
                    "url": data.replace("cart_add:", "") if data.startswith("cart_add:") else "",
                    "image_url": "", "category": "",
                    "quantity": 1, "notes": "", "source": "telegram_bot",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                if db.insert("cart_items", cart_item):
                    await tg_send(chat_id, f"✅ {product_name[:30]} masuk keranjang! 🛒\nKetik /cart untuk lihat & checkout.")
                else:
                    await tg_send(chat_id, "❌ Gagal simpan ke keranjang. Coba lagi.")
            elif action == "buy":
                await tg_send(chat_id, "💳 Untuk beli, kirim /beli diikuti nama produk. Atau hubungi @fakhriazzam.")
            elif action == "buy_all":
                await tg_send(chat_id, "💳 Semua produk akan diproses. Ketik /beli untuk checkout atau kirim nama + alamat.")
            elif action == "skip":
                await tg_send(chat_id, "👌 Baik, skip dulu. Cari produk lain? Ketik nama barangnya.")
            elif action == "clear":
                await handle_cart_clear(chat_id)
            elif action.startswith("remove_"):
                item_id = action.replace("remove_", "")
                await handle_cart_remove(chat_id, item_id)
            elif action.isdigit():
                await tg_send(chat_id, f"📦 Produk #{action} tercatat! Mau beli? Ketik /beli atau 'simpen ini'.")
            else:
                await tg_send(chat_id, "📦 Produk tercatat! Gunakan /beli untuk checkout atau bilang 'simpen ini'.")
        elif data == "/help":
            await handle_help(chat_id)
        return

    message = update.get("message")
    if not message:
        return

    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    
    # ── Handle non-text messages (photos, etc.) ──
    if not text:
        photo = message.get("photo")
        if photo:
            # Get largest photo (last in array has highest resolution)
            file_id = photo[-1]["file_id"]
            asyncio.create_task(handle_photo(chat_id, file_id))
            return
        return

    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    if "@" in command:
        command = command.split("@")[0]

    log.info(f"← {chat_id}: {text[:60]}")

    user_profile = await lookup_user_by_telegram_id(chat_id)

    # ── Session expiry check (24h inactivity) ──
    # Allow auth/reset commands even if session expired
    if user_profile and command not in ("/start", "/login", "/register", "/unlink", "/reset"):
        if not await _is_session_valid(chat_id):
            await _notify_session_expired(chat_id)
            return
        # Refresh session timestamp
        await _update_last_active(chat_id)

    if command == "/start":
        await handle_start(chat_id, args)
    elif command == "/status":
        await handle_status(chat_id)
    elif command == "/pesanan":
        await handle_pesanan(chat_id)
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
    elif command == "/browse":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_browse(chat_id, args)
    elif command == "/click":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_bclick(chat_id, args)
    elif command == "/type":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_btype(chat_id, args)
    elif command == "/scroll":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_bscroll(chat_id, args)
    elif command == "/screenshot":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_bscreenshot(chat_id)
    elif command == "/snap":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_bsnap(chat_id)
    elif command == "/bclose":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_bclose(chat_id)
    elif command == "/cart":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_cart(chat_id)
    elif command == "/ai-cari":
        if not user_profile:
            await require_login(chat_id)
            return
        search_text = args if args else ""
        await handle_ai_cari(chat_id, search_text)
    elif command == "/katalog":
        await handle_katalog(chat_id, text)
    elif command == "/jadwal":
        await handle_jadwal(chat_id)
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
    elif "Katalog" in text:
        await handle_katalog(chat_id, "/katalog")
    elif "Jadwal" in text:
        await handle_jadwal(chat_id)
    elif any(kw in text for kw in ["Akun Saya"]):
        await handle_status(chat_id)
    elif "Pesanan" in text:
        await handle_pesanan(chat_id)
    elif "Tagihan" in text:
        await handle_tagihan(chat_id)
    elif "Wishlist" in text or "Wishlist" in text:
        await handle_wishlist(chat_id)
    elif "Cart" in text or "Keranjang" in text or text == "/cart":
        if not user_profile:
            await require_login(chat_id)
            return
        await handle_cart(chat_id)
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
        
        # Auto-detect: cari <produk> -> standard AI with tool calling (reliable via scraper API)
        # AI Browser via /ai-cari only for explicit manual requests
        cari_match = re.match(r'^(?:cari|carikan|search)\s+(.+)$', text.strip(), re.IGNORECASE)
        if cari_match:
            await handle_ai(chat_id, text, user_profile)
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
    
    # Initialize SQLite cache
    db_cache.init_db()
    log.info("SQLite cache initialized")
    
    # Cleanup old conversations (>30 days)
    deleted = db_cache.cleanup_old(ttl_days=30)
    if deleted:
        log.info(f"Cleaned up {deleted} old conversations from cache")
    
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

    if SUMOPOD_API_KEY:
        log.info("Sumopod AI: gemini/gemini-2.5-flash via https://ai.sumopod.com/v1")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"{SUMOPOD_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {SUMOPOD_API_KEY}"},
                    json={"model": SUMOPOD_MODEL, "messages": [{"role": "user", "content": "test"}], "max_tokens": 5},
                )
                if r.status_code == 200:
                    log.info("DeepSeek AI connection OK")
        except:
            log.warning("DeepSeek check failed")
    else:
        log.warning("SUMOPOD_API_KEY tidak diatur")

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
        asyncio.run(browser.cleanup_all())
