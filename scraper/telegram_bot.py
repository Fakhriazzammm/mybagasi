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
JPY_TO_IDR = 105
SERVICE_FEE_RATE = 0.15
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
MAX_HISTORY = 20

# ── Telegram Helpers ──────────────────────────────────────

def tg_url(method: str) -> str:
    return f"{TELEGRAM_API}/{method}"

async def tg_send(chat_id: int, text: str, parse_mode: str = "Markdown") -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                tg_url("sendMessage"),
                json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
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

async def tg_split_send(chat_id: int, text: str, parse_mode: str = "Markdown"):
    if len(text) <= 4000:
        return await tg_send(chat_id, text, parse_mode)
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
    for part in parts:
        await tg_send(chat_id, part, parse_mode)
        await asyncio.sleep(0.3)

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

async def save_quotation(user_id: str, product: str, price_jpy: int, source: str,
                         url: str | None = None, exchange_rate: int = JPY_TO_IDR) -> dict | None:
    """Save a quotation to Supabase and return it."""
    fee = round(price_jpy * JPY_TO_IDR * SERVICE_FEE_RATE)
    tax = round((price_jpy * JPY_TO_IDR + fee) * TAX_RATE)
    total = price_jpy * JPY_TO_IDR + fee + SHIPPING_IDR + tax
    data = {
        "user_id": user_id,
        "product": product[:200],
        "url": url or None,
        "source": source,  # 'mercari', 'telegram_bot', etc.
        "price_jpy": price_jpy,
        "exchange_rate": exchange_rate,
        "service_fee": fee,
        "shipping_cost": SHIPPING_IDR,
        "tax_customs": tax,
        "membership_discount": 0,
        "points_used": 0,
        "total": total,
        "status": "active",
    }
    return await supabase_insert("quotations", data)

async def save_order(user_id: str, product: str, price_jpy: int, total: int,
                     source: str = "telegram_bot", quotation_id: str | None = None,
                     customer_name: str = "", notes: str = "") -> dict | None:
    """Save an order to Supabase and return it."""
    fee = round(price_jpy * JPY_TO_IDR * SERVICE_FEE_RATE)
    tax = round((price_jpy * JPY_TO_IDR + fee) * TAX_RATE)
    data = {
        "user_id": user_id,
        "quotation_id": quotation_id or None,
        "product": product[:200],
        "source": source,
        "price_jpy": price_jpy,
        "exchange_rate": JPY_TO_IDR,
        "service_fee": fee,
        "shipping_cost": SHIPPING_IDR,
        "tax_customs": tax,
        "membership_discount": 0,
        "points_used": 0,
        "total": total,
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
                return r.json()
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
- Membantu pelanggan Indonesia membeli produk dari marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction, dll)
- Memberikan estimasi harga all-in (harga produk, fee jasa 15%, ongkir Rp250.000, pajak 8%)
- Memproses pembayaran via Mayar

KONVERSI:
- Kurs: 1 JPY = Rp 105
- Fee jasa MyBagasi: 15% dari harga produk (IDR)
- Ongkir Jepang → Indonesia: Rp 250.000
- Pajak & bea cukai: 8% dari (harga produk + fee jasa)

PENTING - DATA TERSIMPAN OTOMATIS:
- Setiap kali kamu mencari atau scrape produk, data akan kamu SIMPAN ke database MyBagasi
- User bisa melihat semua quotation, order, dan wishlist di dashboard web
- Jadi pastikan data yang kamu simpan AKURAT
- Jika user minta simpan ke wishlist atau buat price alert, gunakan tool yang tersedia

ALUR KERJA:
1. Jika user mengirim LINK produk → gunakan tool scrape_product
2. Jika user mencari produk (kata kunci) → gunakan tool search_products
3. Setelah dapat data produk, berikan estimasi harga all-in
4. Jika user setuju beli, tanya: nama lengkap, email, nomor HP
5. Gunakan tool create_payment setelah dapat konfirmasi
6. Berikan link pembayaran ke user

LARANGAN:
- JANGAN PERNAH membuat data produk palsu
- JANGAN menebak harga produk
- Jika scraping gagal, katakan jujur
- Jawab dalam Bahasa Indonesia yang ramah, singkat, to the point
- Jangan sebut tool internal (scrape_product, search_products, dll)

FORMAT JAWABAN:

Untuk hasil scrape/search berhasil:
📍 *Nama Produk*
💰 Harga: JPY X (Rp Y)
🏪 Marketplace: ...

Estimasi Biaya:
• Harga Produk: Rp ...
• Fee Jasa (15%): Rp ...
• Ongkir: Rp 250.000
• Pajak: Rp ...
• Total All-in: Rp ...

📌 *Data sudah tersimpan di dashboard MyBagasi kamu!*

Untuk pembayaran setelah konfirmasi:
✅ *Invoice dibuat!*
Klik link berikut untuk bayar:
🔗 [Link Pembayaran](url)
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "scrape_product",
            "description": "Scrape detail produk dari URL marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction). Panggil ini jika user memberikan link produk. Data akan otomatis tersimpan.",
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
            "description": "Cari produk di marketplace Jepang berdasarkan kata kunci. Hasil pencarian akan tersimpan otomatis. Panggil jika user mencari produk tanpa link.",
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

def estimate_price(product_jpy: int) -> dict:
    base_idr = product_jpy * JPY_TO_IDR
    fee = round(base_idr * SERVICE_FEE_RATE)
    tax = round((base_idr + fee) * TAX_RATE)
    total = base_idr + fee + SHIPPING_IDR + tax
    return {"base_idr": base_idr, "fee": fee, "shipping": SHIPPING_IDR, "tax": tax, "total": total, "rate": JPY_TO_IDR}

async def execute_tool(tool_name: str, args: dict, user_id: str | None = None) -> str:
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
    
    max_turns = 5
    for turn in range(max_turns):
        result = await call_deepseek(msgs, with_tools=True)
        
        if "error" in result:
            error_msg = f"Maaf, AI sedang bermasalah. Coba lagi ya."
            conv["messages"].append({"role": "assistant", "content": error_msg})
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
                    
                    tool_result = await execute_tool(tool_name, tool_args, user_id)
                    
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
        
        return ai_text
    
    fallback = "Percakapan terlalu panjang. Coba mulai lagi dengan /reset ya."
    conv["messages"].append({"role": "assistant", "content": fallback})
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
            await tg_send(chat_id,
                f"👋 Halo *{existing['name']}*! Selamat datang kembali! 🎉\n\n"
                f"Akun MyBagasi kamu sudah terhubung.\n\n"
                f"*Yang bisa kamu lakukan:*\n"
                f"🔍 Cari produk — ketik `/beli onitsuka tiger`\n"
                f"🔗 Cek harga — kirim link marketplace\n"
                f"💳 Beli & bayar — langsung via chat\n"
                f"📋 Wishlist — simpan & pantau harga\n"
                f"📊 Data tersimpan — lihat di dashboard web\n\n"
                f"*Perintah:* /beli /cek /status /wishlist /help")
        else:
            await tg_send(chat_id,
                "👋 *Selamat datang di MyBagasi Bot!*\n\n"
                "Untuk menghubungkan akun MyBagasi kamu:\n"
                "`/start KODE_RAHASIA_KAMU`\n\n"
                "Kode rahasia ada di halaman *Profile* aplikasi MyBagasi.\n"
                "https://mybagasi.my.id/profile\n\n"
                "Belum punya akun? Daftar di https://mybagasi.my.id/auth/register")
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

async def handle_wishlist(chat_id: int):
    """Handle /wishlist — show user's saved wishlist items."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(chat_id, "⚠️ Hubungkan akun dulu dengan `/start KODE`")
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

async def handle_ai(chat_id: int, text: str, user_profile: dict | None):
    if not DEEPSEEK_API_KEY:
        await tg_send(chat_id, "❌ AI Personal Shopper belum dikonfigurasi.")
        return
    await tg_typing(chat_id)
    response = await ai_process(chat_id, text, user_profile)
    await tg_split_send(chat_id, response)

# ── Message Router ─────────────────────────────────────────

async def process_update(update: dict):
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
    elif command == "/unlink":
        await handle_unlink(chat_id)
    elif command == "/wishlist":
        await handle_wishlist(chat_id)
    elif command == "/help":
        await handle_help(chat_id)
    elif command == "/reset":
        reset_conversation(chat_id)
        await tg_send(chat_id, "🔄 Percakapan di-reset. Mulai lagi yuk!")
    elif command in ("/beli", "/ai", "/cari"):
        search_text = args if args else text
        if not user_profile:
            await tg_send(chat_id,
                "⚠️ Kamu harus menghubungkan akun MyBagasi dulu.\n"
                "Gunakan `/start KODE` dari halaman Profile.")
            return
        await handle_ai(chat_id, search_text, user_profile)
    elif command == "/cek":
        if not args:
            await tg_send(chat_id, "📎 Kirim link marketplace setelah /cek\nContoh: `/cek https://jp.mercari.com/...`")
            return
        if not user_profile:
            await tg_send(chat_id, "⚠️ Hubungkan akun dulu dengan `/start KODE`")
            return
        await handle_ai(chat_id, f"Tolong cek harga produk ini: {args}", user_profile)
    else:
        if not user_profile:
            await handle_start(chat_id, "")
            return
        
        is_url = bool(re.match(r'^https?://', text))
        await handle_ai(chat_id, text, user_profile)

# ── Polling Loop ───────────────────────────────────────────

async def poll_forever():
    if not BOT_TOKEN:
        log.error("TELEGRAM_BOT_TOKEN tidak diatur")
        return
    
    log.info(f"Bot starting... @mybagasibot")

    offset = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=POLL_TIMEOUT + 10) as client:
                r = await client.get(
                    tg_url("getUpdates"),
                    params={"offset": offset, "timeout": POLL_TIMEOUT, "allowed_updates": json.dumps(["message"])},
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
