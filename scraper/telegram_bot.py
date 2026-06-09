"""
MyBagasi Telegram Bot — AI Personal Shopper
============================================
Full-featured bot with DeepSeek AI integration:
  - Link akun MyBagasi via unique token
  - AI Personal Shopper (cari produk, scrape, estimasi harga, checkout via Mayar)
  - Multi-turn conversation with tool calling
  
Commands:
  /start <TOKEN>   — Link Telegram ke MyBagasi
  /status          — Cek status akun
  /unlink          — Putus sambungan
  /beli <keyword>  — Cari produk Jepang (AI-driven)
  /cek <url>       — Cek harga produk dari link
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

# Pricing (mirror from frontend)
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
conversations: dict[int, dict[str, Any]] = {}
MAX_HISTORY = 20  # max messages to keep in history

# ── Helpers ────────────────────────────────────────────────

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
    """Show typing indicator."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(tg_url("sendChatAction"), json={"chat_id": chat_id, "action": "typing"})
    except:
        pass

async def tg_split_send(chat_id: int, text: str, parse_mode: str = "Markdown"):
    """Split long messages to respect Telegram 4096 char limit."""
    if len(text) <= 4000:
        return await tg_send(chat_id, text, parse_mode)
    parts = []
    while text:
        if len(text) <= 4000:
            parts.append(text)
            break
        # Try to split at last newline before 4000
        split_at = text.rfind("\n", 0, 4000)
        if split_at < 0:
            split_at = 4000
        parts.append(text[:split_at])
        text = text[split_at:]
    for part in parts:
        await tg_send(chat_id, part, parse_mode)
        await asyncio.sleep(0.3)

# ── Supabase Helpers ───────────────────────────────────────

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

async def create_quotation_supabase(data: dict) -> dict | None:
    """Save quotation to Supabase."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/quotations",
                json=data,
                headers=headers,
            )
            if r.status_code in (200, 201):
                return r.json()[0] if r.json() else None
            log.warning(f"create_quotation HTTP {r.status_code}: {r.text[:200]}")
            return None
    except Exception as e:
        log.error(f"create_quotation error: {e}")
        return None

async def create_order_supabase(data: dict) -> dict | None:
    """Save order to Supabase."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/orders",
                json=data,
                headers=headers,
            )
            if r.status_code in (200, 201):
                return r.json()[0] if r.json() else None
            log.warning(f"create_order HTTP {r.status_code}: {r.text[:200]}")
            return None
    except Exception as e:
        log.error(f"create_order error: {e}")
        return None

# ── Scraper Integration ────────────────────────────────────

async def scraper_scrape(url: str) -> dict:
    """Scrape product details via backend."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{SCRAPER_URL}/scrape",
                json={"url": url},
            )
            if r.status_code == 200:
                return r.json()
            return {"error": f"HTTP {r.status_code}", "url": url}
    except Exception as e:
        return {"error": str(e), "url": url}

async def scraper_search(keyword: str, limit: int = 6) -> dict:
    """Search products via backend."""
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                f"{SCRAPER_URL}/search",
                json={"keyword": keyword, "limit": limit},
            )
            if r.status_code == 200:
                return r.json()
            return {"success": False, "items": [], "error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"success": False, "items": [], "error": str(e)}

async def create_payment_invoice(data: dict) -> dict:
    """Create Mayar payment invoice via backend proxy."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{SCRAPER_URL}/mayar/invoice/create",
                json=data,
            )
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

ALUR KERJA:
1. Jika user mengirim LINK produk → gunakan tool scrape_product untuk membaca detailnya
2. Jika user mencari produk (kata kunci) → gunakan tool search_products
3. Setelah dapat data produk, berikan estimasi harga all-in
4. Jika user setuju beli, tanya: nama lengkap, email, nomor HP
5. Gunakan tool create_payment setelah dapat konfirmasi
6. Berikan link pembayaran ke user

PENTING - LARANGAN:
- JANGAN PERNAH membuat data produk palsu
- JANGAN menebak harga produk
- Jika scraping gagal, katakan jujur dan tawarkan alternatif
- Jika user kirim link yang bukan marketplace Jepang, beri tahu bahwa hanya marketplace Jepang yang didukung
- Selalu jawab dalam Bahasa Indonesia yang ramah dan santai
- Jawab singkat, to the point, jangan bertele-tele
- Jangan sebut tool internal (scrape_product, search_products, dll). Gunakan bahasa natural.

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
            "description": "Scrape detail produk dari URL marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction). Panggil ini jika user memberikan link produk.",
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
            "description": "Cari produk di marketplace Jepang berdasarkan kata kunci. Panggil jika user mencari produk tanpa link.",
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
            "name": "create_payment",
            "description": "Buat invoice pembayaran via Mayar setelah user konfirmasi beli. Parameter: nama customer, email, no HP, deskripsi, dan item breakdown.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_name": {"type": "string", "description": "Nama lengkap customer"},
                    "customer_email": {"type": "string", "description": "Email customer"},
                    "customer_mobile": {"type": "string", "description": "No HP customer (format Indonesia)"},
                    "order_description": {"type": "string", "description": "Deskripsi pesanan"},
                    "items": {
                        "type": "array",
                        "description": "Rincian biaya",
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
    """Call DeepSeek API with messages and optional tools."""
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
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                },
                json=body,
            )
            if r.status_code == 200:
                return r.json()
            log.error(f"DeepSeek API error {r.status_code}: {r.text[:300]}")
            return {"error": f"API error {r.status_code}", "detail": r.text[:300]}
    except Exception as e:
        log.error(f"DeepSeek call error: {e}")
        return {"error": str(e)}

async def execute_tool(tool_name: str, args: dict, user_id: str | None = None) -> str:
    """Execute a tool and return result as JSON string."""
    if tool_name == "scrape_product":
        url = args.get("url", "")
        if not url:
            return json.dumps({"error": "URL diperlukan"})
        log.info(f"Tool: scrape_product {url}")
        result = await scraper_scrape(url)
        return json.dumps(result)

    elif tool_name == "search_products":
        keyword = args.get("keyword", "")
        limit = args.get("limit", 5)
        if not keyword:
            return json.dumps({"error": "Kata kunci diperlukan"})
        log.info(f"Tool: search_products '{keyword}' limit={limit}")
        result = await scraper_search(keyword, limit)
        return json.dumps(result)

    elif tool_name == "create_payment":
        log.info(f"Tool: create_payment for {args.get('customer_name', '')}")
        invoice_data = {
            "name": args.get("customer_name", ""),
            "email": args.get("customer_email", "contact@djiwatentram.com"),
            "mobile": args.get("customer_mobile", "081234567890"),
            "description": args.get("order_description", "Pembelian MyBagasi"),
            "items": args.get("items", []),
        }
        result = await create_payment_invoice(invoice_data)
        return json.dumps(result)

    return json.dumps({"error": f"Unknown tool: {tool_name}"})

def estimate_price(product_jpy: int) -> dict:
    """Calculate all-in price estimation."""
    base_idr = product_jpy * JPY_TO_IDR
    fee = round(base_idr * SERVICE_FEE_RATE)
    tax = round((base_idr + fee) * TAX_RATE)
    total = base_idr + fee + SHIPPING_IDR + tax
    return {
        "base_idr": base_idr,
        "fee": fee,
        "shipping": SHIPPING_IDR,
        "tax": tax,
        "total": total,
        "rate": JPY_TO_IDR,
    }

async def ai_process(chat_id: int, user_message: str, user_profile: dict | None) -> str:
    """Process a user message through the AI agent loop."""
    # Ensure conversation state exists
    if chat_id not in conversations:
        conversations[chat_id] = {"messages": [], "context": {}}
    conv = conversations[chat_id]
    
    # Add user message to history
    conv["messages"].append({"role": "user", "content": user_message})
    # Trim history
    if len(conv["messages"]) > MAX_HISTORY:
        conv["messages"] = conv["messages"][-MAX_HISTORY:]
    
    # Build message list with system prompt
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    if user_profile:
        msgs.append({"role": "system", "content": f"User terdaftar: {user_profile.get('name', '')} (email: {user_profile.get('email', '')})"})
    msgs.extend(conv["messages"])
    
    # AI loop (max 5 tool turns)
    max_turns = 5
    for turn in range(max_turns):
        result = await call_deepseek(msgs, with_tools=True)
        
        if "error" in result:
            error_msg = f"Maaf, AI sedang bermasalah. Coba lagi ya. (Error: {result['error']})"
            conv["messages"].append({"role": "assistant", "content": error_msg})
            return error_msg
        
        choice = result["choices"][0]["message"]
        
        if choice.get("tool_calls"):
            # Execute each tool call
            for tc in choice["tool_calls"]:
                if tc["type"] == "function":
                    tool_name = tc["function"]["name"]
                    try:
                        tool_args = json.loads(tc["function"]["arguments"])
                    except:
                        tool_args = {}
                    
                    # Show typing while tool runs
                    asyncio.create_task(tg_typing(chat_id))
                    
                    tool_result = await execute_tool(
                        tool_name, tool_args,
                        user_profile.get("id") if user_profile else None
                    )
                    
                    msgs.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": tc["id"],
                            "type": "function",
                            "function": {"name": tool_name, "arguments": tc["function"]["arguments"]}
                        }]
                    })
                    msgs.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": tool_result
                    })
            
            # Show typing while AI thinks
            asyncio.create_task(tg_typing(chat_id))
            continue  # Let AI respond to tool results
        
        # No tool calls — final response
        ai_text = choice.get("content", "").strip()
        if ai_text:
            conv["messages"].append({"role": "assistant", "content": ai_text})
        else:
            ai_text = "Maaf, saya tidak bisa memproses permintaan itu. Coba kirim link produk atau kata kunci yang lebih spesifik."
            conv["messages"].append({"role": "assistant", "content": ai_text})
        
        return ai_text
    
    # Max turns reached
    fallback = "Percakapan terlalu panjang. Coba mulai lagi dengan /reset ya."
    conv["messages"].append({"role": "assistant", "content": fallback})
    return fallback

def reset_conversation(chat_id: int):
    """Reset conversation for a user."""
    if chat_id in conversations:
        del conversations[chat_id]

# ── Command Handlers ───────────────────────────────────────

async def handle_start(chat_id: int, args: str):
    token = args.strip().upper()
    if not token:
        await tg_send(chat_id,
            "👋 *Selamat datang di MyBagasi Bot!*\n\n"
            "Untuk menghubungkan akun MyBagasi kamu:\n"
            "`/start KODE_RAHASIA_KAMU`\n\n"
            "Kode rahasia ada di halaman *Profile* aplikasi MyBagasi.\n"
            "https://mybagasi.my.id/profile\n\n"
            "Belum punya akun? Daftar di https://mybagasi.my.id/auth/register")
        return

    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Email: `{existing['email']}`\n\n"
            "Gunakan `/unlink` dulu untuk ganti akun.")
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
        await tg_send(chat_id,
            f"✅ *Berhasil terhubung!*\n\n"
            f"Halo *{user['name']}*! 🎉\n\n"
            f"Sekarang kamu bisa:\n"
            f"🔍 Cari produk Jepang — kirim kata kunci\n"
            f"🔗 Cek harga — kirim link marketplace\n"
            f"💳 Beli & bayar — konfirmasi via chat\n\n"
            f"Coba ketik: `/beli onitsuka tiger`\n"
            f"Atau kirim: `https://jp.mercari.com/item/...`")
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
    await tg_send(chat_id,
        f"✅ *Terhubung ke MyBagasi*\n\n"
        f"Nama: *{user['name']}*\n"
        f"Email: `{user['email']}`\n"
        f"Role: `{user.get('role', 'customer')}`\n"
        f"Kode: `{user['telegram_token']}`\n\n"
        f"Ketik `/beli <produk>` untuk mulai belanja!")

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
            f"Akun *{user['name']}* sudah tidak terhubung.")
        log.info(f"User {user['name']} ({user['id']}) unlinked")
    else:
        await tg_send(chat_id, "❌ Gagal memutus sambungan.")

async def handle_help(chat_id: int):
    await tg_send(chat_id,
        "📖 *MyBagasi Bot — Bantuan*\n\n"
        "*Akun*\n"
        "`/start KODE` — Hubungkan akun MyBagasi\n"
        "`/status` — Cek status akun\n"
        "`/unlink` — Putus sambungan\n\n"
        "*Belanja (AI Personal Shopper)*\n"
        "🔍 Kirim *kata kunci* — cari produk Jepang\n"
        "🔗 Kirim *link marketplace* — cek harga\n"
        "`/beli <keyword>` — Cari & beli (AI mode)\n"
        "`/reset` — Reset percakapan\n\n"
        "*Contoh:*\n"
        "`Cari sepatu Nike size 42`\n"
        "`https://jp.mercari.com/item/m1234567890`\n"
        "`/beli kamera fujifilm`\n\n"
        "💡 *Butuh bantuan?* Chat admin: @fakhriazzam")

async def handle_ai(chat_id: int, text: str, user_profile: dict | None):
    """Process a message through AI Personal Shopper."""
    # Validate AI config
    if not DEEPSEEK_API_KEY:
        await tg_send(chat_id, "❌ AI Personal Shopper belum dikonfigurasi. Admin akan segera设置.")
        return
    
    # Show typing
    await tg_typing(chat_id)
    
    # Process
    await tg_typing(chat_id)
    response = await ai_process(chat_id, text, user_profile)
    
    # Send response (split if needed)
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

    # Parse command
    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    # Remove bot username from command: /start@mybagasibot
    if "@" in command:
        command = command.split("@")[0]

    log.info(f"← {chat_id}: {text[:60]}")

    # Get user profile (needed for AI mode)
    user_profile = await lookup_user_by_telegram_id(chat_id)

    # Handle commands
    if command == "/start":
        await handle_start(chat_id, args)
    elif command == "/status":
        await handle_status(chat_id)
    elif command == "/unlink":
        await handle_unlink(chat_id)
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
            await tg_send(chat_id, "📎 Kirim link marketplace Jepang setelah /cek\nContoh: `/cek https://jp.mercari.com/...`")
            return
        if not user_profile:
            await tg_send(chat_id, "⚠️ Hubungkan akun dulu dengan `/start KODE`")
            return
        await handle_ai(chat_id, f"Tolong cek harga produk ini: {args}", user_profile)
    else:
        # Non-command: check if it's a URL or product search
        if not user_profile:
            await handle_start(chat_id, "")
            return
        
        # Auto-detect: URL → scrape, otherwise → AI search
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
                    params={
                        "offset": offset,
                        "timeout": POLL_TIMEOUT,
                        "allowed_updates": json.dumps(["message"]),
                    },
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
    log.info("MyBagasi Telegram Bot v2 — AI Personal Shopper")
    log.info("=" * 40)

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL dan SUPABASE_KEY wajib diatur")
        sys.exit(1)

    # Verify DeepSeek config
    if DEEPSEEK_API_KEY:
        log.info(f"DeepSeek AI: {DEEPSEEK_MODEL} via {DEEPSEEK_BASE_URL}")
        # Quick test
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"{DEEPSEEK_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                    json={"model": DEEPSEEK_MODEL, "messages": [{"role": "user", "content": "test"}], "max_tokens": 5},
                )
                if r.status_code == 200:
                    log.info("DeepSeek AI connection OK")
                else:
                    log.warning(f"DeepSeek API check: HTTP {r.status_code}")
        except Exception as e:
            log.warning(f"DeepSeek check failed: {e}")
    else:
        log.warning("DEEPSEEK_API_KEY tidak diatur — AI mode tidak akan berfungsi")

    # Verify scraper backend
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{SCRAPER_URL}/health")
            if r.status_code == 200:
                log.info(f"Scraper backend OK ({SCRAPER_URL})")
    except Exception as e:
        log.warning(f"Scraper backend unreachable: {e}")

    # Verify Supabase
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{SUPABASE_URL}/rest/v1/profiles", params={"select": "count", "limit": 1}, headers=headers)
            if r.status_code == 200:
                log.info("Supabase connection OK")
    except Exception as e:
        log.warning(f"Supabase check failed: {e}")

    await poll_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot stopped by user")
