"""
Admin bot for MyBagasi & Jastip operations.
Listens in admin Telegram group for commands to manage orders.
Sends notifications when new orders are created.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("admin_bot")

# ─── Config ───────────────────────────────────────────────
BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN", "")
ADMIN_GROUP_ID = int(os.getenv("ADMIN_TELEGRAM_GROUP_ID", "-5271361615"))
SCRAPER_URL = os.getenv("SCRAPER_URL", "http://127.0.0.1:8000")

# Telegram API
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ─── Status helpers ──────────────────────────────────────
STATUS_LABELS = {
    "dipesan": "Dipesan — menunggu dicari",
    "dicari": "Dicari di Store Jepang",
    "dibeli": "Sudah Dibeli di Jepang",
    "di_gudang_jp": "Sampai di Gudang Jepang",
    "dikirim": "Dikirim ke Indonesia",
    "di_gudang_id": "Sampai di Gudang Indonesia",
    "dikemas": "Dikemas untuk Dikirim",
    "dikirim_ke_user": "Dikirim ke Kamu",
    "selesai": "Selesai ✅",
    "batal": "Dibatalkan ❌",
}

STATUS_EMOJI_MAP = {
    "dipesan": "🆕",
    "dicari": "🔍",
    "dibeli": "🛒",
    "di_gudang_jp": "📦",
    "dikirim": "✈️",
    "di_gudang_id": "🏭",
    "dikemas": "📦",
    "dikirim_ke_user": "🚚",
    "selesai": "✅",
    "batal": "❌",
}

# ─── Status order for progress ────────────────────────────
ORDER_STATUSES = [
    "dipesan",
    "dicari",
    "dibeli",
    "di_gudang_jp",
    "dikirim",
    "di_gudang_id",
    "dikemas",
    "dikirim_ke_user",
    "selesai",
]


def _get_step_progress(status: str) -> str:
    """Return step progress like 'Langkah 3 dari 9'."""
    if status in ("selesai", "batal"):
        return ""
    try:
        idx = ORDER_STATUSES.index(status)
        total = len(ORDER_STATUSES) - 1  # exclude selesai
        return f"📋 Langkah {idx + 1} dari {total}"
    except ValueError:
        return ""


# ─── Telegram API helpers ─────────────────────────────────

async def tg_send(chat_id: int, text: str, parse_mode: str = "Markdown") -> dict | None:
    """Send a message to a Telegram chat."""
    url = f"{API_BASE}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            })
            if r.is_success:
                return r.json()
            log.warning(f"tg_send error: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log.error(f"tg_send exception: {e}")
    return None


async def tg_send_with_keyboard(chat_id: int, text: str, keyboard: list[list[dict]]) -> dict | None:
    """Send a message with inline keyboard."""
    url = f"{API_BASE}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "Markdown",
                "reply_markup": {"inline_keyboard": keyboard},
            })
            if r.is_success:
                return r.json()
            log.warning(f"tg_keyboard error: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log.error(f"tg_keyboard exception: {e}")
    return None


async def tg_answer_callback(callback_id: str, text: str):
    """Answer a callback query."""
    url = f"{API_BASE}/answerCallbackQuery"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={
                "callback_query_id": callback_id,
                "text": text,
                "show_alert": False,
            })
    except Exception:
        pass


# ─── Order management ─────────────────────────────────────

async def get_orders_list() -> list[dict]:
    """Get all active orders from scraper."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{SCRAPER_URL}/orders/list")
            if r.is_success:
                data = r.json()
                return data.get("orders", [])
    except Exception as e:
        log.error(f"get_orders_list error: {e}")
    return []


async def update_order_status(order_id: str, status: str, note: str = "") -> dict | None:
    """Update order status via scraper API (admin bypass, no telegram_id needed)."""
    try:
        params = {
            "order_id": order_id,
            "status": status,
            "note": note,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{SCRAPER_URL}/orders/admin-update", params=params)
            if r.is_success:
                return r.json()
            log.warning(f"update_order_status error: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log.error(f"update_order_status exception: {e}")
    return None


# ─── Command handlers ─────────────────────────────────────

def parse_command(text: str) -> tuple[str, str, str]:
    """Parse a command from group chat.
    Returns (command, order_id, note)
    """
    text = text.strip()
    parts = text.split()
    cmd = parts[0].lower() if parts else ""
    
    order_id = ""
    note = ""
    if len(parts) >= 2:
        order_id = parts[1]
    if len(parts) >= 3:
        note = " ".join(parts[2:])
    
    # Strip bot username from command: /cmd@botname -> /cmd
    if "@" in cmd:
        cmd = cmd.split("@")[0]
    
    return cmd, order_id, note


COMMAND_MAP = {
    "/status": "status",
    "/cari": "dicari",
    "/beli": "dibeli",
    "/gudang_jp": "di_gudang_jp",
    "/kirim": "dikirim",
    "/gudang_id": "di_gudang_id",
    "/kemas": "dikemas",
    "/kirim_user": "dikirim_ke_user",
    "/selesai": "selesai",
    "/batal": "batal",
    "/pesanan": "status",
}

# ─── Invoice creation state machine ────────────────────────
# Key: user_id (int), Value: dict with step, name, items, msg_id
_invoice_sessions: dict[int, dict] = {}

INVOICE_STEPS = {
    "name": "name",
    "items": "items",
    "confirm": "confirm",
}


# ─── Invoice creation functions ────────────────────────────

async def _invoice_start(user_id: int, chat_id: int):
    """Start the invoice creation flow — ask for customer name."""
    _invoice_sessions[user_id] = {
        "step": "name",
        "name": "",
        "phone": "",
        "address": "",
        "email": "",
        "notes": "",
        "payment_type": "LUNAS",
        "items": [],
        "chat_id": chat_id,
        "msg_id": None,
    }
    await tg_send(
        chat_id,
        "🧾 *Buat Invoice Baru*\n\n"
        "📝 Siapa nama customer?\n\n"
        "_Ketik nama atau /inv-cancel untuk batal_",
    )


# ─── Generic step handler ─────────────────────────────────

async def _invoice_ask_next(user_id: int):
    """Advance to the next step after saving current input."""
    session = _invoice_sessions.get(user_id)
    if not session:
        return

    chat_id = session["chat_id"]
    step = session["step"]

    steps = [
        ("name", "📝 Siapa nama customer?\n\n_Ketik nama atau /inv-cancel untuk batal_"),
        ("phone", "📱 Nomor WhatsApp customer?\n\n_Contoh: 08123456789_"),
        ("address", "📮 Alamat pengiriman?\n\n_Contoh: Jl. Merpati No.5, Jakarta_"),
        ("email", "✉️ Email customer? (_opsional, langsung enter untuk skip_)"),
        ("notes", "📝 Catatan kirim? (_opsional, langsung enter untuk skip_)\n_Contoh: Bungkus bubble wrap_"),
    ]

    idx = -1
    for i, (s, _) in enumerate(steps):
        if s == step:
            idx = i
            break

    # Find next step
    next_idx = idx + 1
    while next_idx < len(steps):
        next_step, question = steps[next_idx]
        session["step"] = next_step
        await tg_send(chat_id, question)
        return

    # All text steps done → ask payment type
    session["step"] = "payment_type"
    await _invoice_ask_payment_type(user_id)


async def _invoice_ask_payment_type(user_id: int):
    """Ask admin to choose DP 50% or LUNAS."""
    session = _invoice_sessions.get(user_id)
    if not session:
        return

    keyboard = [
        [{"text": "💰 DP 50%", "callback_data": f"invpay:dp:{user_id}"}],
        [{"text": "💵 LUNAS", "callback_data": f"invpay:lunas:{user_id}"}],
        [{"text": "❌ Batal", "callback_data": f"invoice:cancel:{user_id}"}],
    ]
    await tg_send_with_keyboard(
        session["chat_id"],
        "💰 **Metode Pembayaran**\n\nPilih metode pembayaran:",
        keyboard,
    )


async def _invoice_handle_payment(user_id: int, payment_type: str):
    """Handle payment type selection — start items."""
    session = _invoice_sessions.get(user_id)
    if not session:
        return

    label = "DP 50%" if payment_type == "dp" else "LUNAS"
    session["payment_type"] = label
    session["step"] = "items"
    await tg_send(
        session["chat_id"],
        f"✅ Pembayaran: *{label}*\n\n"
        "📦 Tambahkan item satu per satu:\n"
        "Format: `Nama Barang|Harga`\n"
        "Contoh: `Kaos Anime|150000`\n\n"
        "Kirim `selesai` jika sudah cukup.\n"
        "_Ketik /inv-cancel untuk batal_",
    )


async def _invoice_handle_text(user_id: int, text: str):
    """Route text input to the correct step handler."""
    session = _invoice_sessions.get(user_id)
    if not session:
        return

    step = session["step"]
    text = text.strip()

    if step == "name":
        session["name"] = text
        await tg_send(session["chat_id"], f"✅ Nama: *{text}*")
        await _invoice_ask_next(user_id)

    elif step == "phone":
        if text.lower() in ("", "-", "skip", "nope", "tidak"):
            session["phone"] = ""
            await tg_send(session["chat_id"], "ℹ️ No. WA: skip (pakai default)")
        else:
            session["phone"] = text
            await tg_send(session["chat_id"], f"✅ No. WA: *{text}*")
        await _invoice_ask_next(user_id)

    elif step == "address":
        if text.lower() in ("", "-", "skip", "nope", "tidak"):
            session["address"] = ""
            await tg_send(session["chat_id"], "ℹ️ Alamat: skip")
        else:
            session["address"] = text
            await tg_send(session["chat_id"], f"✅ Alamat: *{text}*")
        await _invoice_ask_next(user_id)

    elif step == "email":
        if text.lower() in ("", "-", "skip", "nope", "tidak"):
            session["email"] = ""
            await tg_send(session["chat_id"], "ℹ️ Email: skip (pakai default)")
        else:
            session["email"] = text
            await tg_send(session["chat_id"], f"✅ Email: *{text}*")
        await _invoice_ask_next(user_id)

    elif step == "notes":
        text_clean = text.strip()
        if text_clean.lower() in ("-", "skip", "nope", "tidak"):
            session["notes"] = ""
            await tg_send(session["chat_id"], "ℹ️ Catatan: skip")
        else:
            session["notes"] = text_clean if text_clean else ""
            if text_clean:
                await tg_send(session["chat_id"], f"✅ Catatan: *{text_clean}*")
        await _invoice_ask_next(user_id)

    elif step == "items":
        await _invoice_handle_item(user_id, text)


async def _invoice_handle_item(user_id: int, text: str):
    """Handle item input — smart parse + AI fallback."""
    session = _invoice_sessions.get(user_id)
    if not session:
        return

    text = text.strip()
    if text.lower() == "selesai":
        if not session["items"]:
            await tg_send(
                session["chat_id"],
                "⚠️ Belum ada item. Tambahkan minimal 1 item.",
            )
            return
        await _invoice_show_confirm(user_id)
        return

    # Try smart parsing first
    name, price = _parse_item_natural(text)
    if name and price > 0:
        session["items"].append({"name": name, "price": price, "quantity": 1})
        total_items = len(session["items"])
        total_price = sum(i["price"] * i["quantity"] for i in session["items"])
        await tg_send(
            session["chat_id"],
            f"✅ *{name}* — Rp{price:,}\n"
            f"📦 Total: {total_items} item | 💰 Rp{total_price:,}\n\n"
            "_Kirim item lagi atau `selesai` untuk lanjut_",
        )
        return

    # Fallback: try AI parsing via DeepSeek
    result = await _parse_item_with_ai(text)
    if result and result.get("name") and result.get("price", 0) > 0:
        name = result["name"]
        price = result["price"]
        session["items"].append({"name": name, "price": price, "quantity": 1})
        total_items = len(session["items"])
        total_price = sum(i["price"] * i["quantity"] for i in session["items"])
        await tg_send(
            session["chat_id"],
            f"✅ *{name}* — Rp{price:,}\n"
            f"📦 Total: {total_items} item | 💰 Rp{total_price:,}\n\n"
            "_Kirim item lagi atau `selesai` untuk lanjut_",
        )
        return

    # Both failed — show error
    await tg_send(
        session["chat_id"],
        "❌ Tidak bisa membaca item. Gunakan format:\n"
        "• `Nama Barang|Harga` — contoh: `Kaos Anime|150000`\n"
        "• `Nama Barang Harga` — contoh: `Baju GU 150000`\n"
        "• `Nama Barang Rp Harga` — contoh: `Sepatu Nike Rp850.000`",
    )


def _parse_item_natural(text: str) -> tuple[str | None, int]:
    """Parse item from natural language without AI.
    
    Handles formats:
    - Nama|Harga (existing)
    - Nama Harga (number at end)
    - Nama Rp Harga (with Rp)
    - Nama harga N (with "harga" keyword)
    - Nama RpN (no space after Rp)
    """
    import re

    # Format 1: pipe separator (existing)
    if "|" in text:
        parts = text.rsplit("|", 1)
        name = parts[0].strip()
        try:
            price_str = parts[1].strip().replace(".", "").replace(",", "").replace("Rp", "").replace("rp", "")
            price = int(price_str)
            if price > 0 and name:
                return name, price
        except ValueError:
            pass

    # Clean up Rp/rp variations (Rp25000, Rp 25000, Rp.25000, etc)
    clean = re.sub(r'\brp\b\.?\s*', '', text, flags=re.IGNORECASE).strip()
    # Also handle Rp without space (Rp25000)
    clean = re.sub(r'rp(?=\d)', '', clean, flags=re.IGNORECASE).strip()

    # Format 2: find "harga" keyword
    # "Baju GU harga 150.000" → name = "Baju GU", price = 150000
    harga_match = re.search(r'\bharga\b', clean, re.IGNORECASE)
    if harga_match:
        name_part = clean[:harga_match.start()].strip()
        price_part = clean[harga_match.end():].strip()
        price = _extract_price(price_part)
        if price and name_part:
            return name_part, price

    # Format 3: find number at the end
    # "Baju GU 150.000" or "Gacha Figure 350000"
    # Strategy: extract last number, split text at that point
    matches = list(re.finditer(r'(\d[\d.,]*)', clean))
    if not matches:
        return None, 0

    last_match = matches[-1]
    price_str = last_match.group()
    price_int = int(price_str.replace(".", "").replace(",", ""))

    if price_int <= 0:
        return None, 0

    # Name is everything before the last number
    name_raw = clean[:last_match.start()].strip()
    if name_raw:
        return name_raw, price_int

    return None, 0


def _extract_price(text: str) -> int | None:
    """Extract integer price from text, handling thousand separators."""
    import re
    # Match: continuous digits and thousand separators
    # Handles: 150000, 150.000, 2.500.000, 150,000
    matches = re.findall(r'(\d[\d.,]*)', text)
    if not matches:
        return None
    # Take the last number (price usually at end)
    last = matches[-1]
    # Remove thousand separators
    price_str = last.replace(".", "").replace(",", "")
    try:
        price = int(price_str)
        return price
    except ValueError:
        return None


async def _parse_item_with_ai(text: str) -> dict | None:
    """Use DeepSeek AI to parse item text into structured data."""
    api_key = os.getenv("SUMOPOD_API_KEY", "")
    base_url = "https://ai.sumopod.com/v1"
    model = "gemini/gemini-2.5-flash"

    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Extract item name and price from Indonesian shopping text. "
                                "Return ONLY valid JSON: {\"name\": \"item name\", \"price\": 123456}. "
                                "Price in Indonesian Rupiah (IDR), integer only, no thousand separators. "
                                "Examples:\n"
                                "- 'Baju GU Harga 150.000' → {\"name\": \"Baju GU\", \"price\": 150000}\n"
                                "- 'Kaos Anime 85000' → {\"name\": \"Kaos Anime\", \"price\": 85000}\n"
                                "- 'Sepatu Nike Rp 2.500.000' → {\"name\": \"Sepatu Nike\", \"price\": 2500000}\n"
                                "- 'Gacha Figure 350000' → {\"name\": \"Gacha Figure\", \"price\": 350000}"
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 100,
                },
            )
            if r.is_success:
                data = r.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                # Extract JSON from response
                import json as _json
                # Try direct parse
                try:
                    return _json.loads(content)
                except _json.JSONDecodeError:
                    pass
                # Try to find JSON in code block
                if "```" in content:
                    json_str = content.split("```")[1]
                    if json_str.startswith("json"):
                        json_str = json_str[4:]
                    try:
                        return _json.loads(json_str.strip())
                    except _json.JSONDecodeError:
                        pass
                # Try to find {...} pattern
                import re
                brace_match = re.search(r'\{.*\}', content, re.DOTALL)
                if brace_match:
                    try:
                        return _json.loads(brace_match.group())
                    except _json.JSONDecodeError:
                        pass
    except Exception as e:
        log.warning(f"AI parse error: {e}")

    return None


async def _invoice_show_confirm(user_id: int):
    """Show invoice summary and ask for confirmation."""
    session = _invoice_sessions.get(user_id)
    if not session:
        return

    session["step"] = "confirm"
    items_list = "\n".join(
        f"• {i['name']} × {i['quantity']} — Rp{i['price']:,}"
        for i in session["items"]
    )
    total_price = sum(i["price"] * i["quantity"] for i in session["items"])

    # Optional fields
    parts = [f"👤 *{session['name']}*"]
    if session["phone"]:
        parts.append(f"📱 {session['phone']}")
    if session["address"]:
        parts.append(f"📮 {session['address']}")
    if session["email"]:
        parts.append(f"✉️ {session['email']}")
    if session["notes"]:
        parts.append(f"📝 {session['notes']}")

    text = (
        f"🧾 *Konfirmasi Invoice*\n\n"
        f"{' | '.join(parts)}\n"
        f"💰 *{session['payment_type']}*\n"
        f"━━━━━━━━━━━━━━━\n"
        f"{items_list}\n"
        f"━━━━━━━━━━━━━━━\n"
        f"💰 *Total: Rp{total_price:,}*\n\n"
        f"Konfirmasi untuk membuat invoice?"
    )

    keyboard = [
        [{"text": "✅ Buat Invoice", "callback_data": f"invoice:create:{user_id}"}],
        [{"text": "❌ Batal", "callback_data": f"invoice:cancel:{user_id}"}],
    ]

    sent = await tg_send_with_keyboard(session["chat_id"], text, keyboard)
    if sent:
        result = sent.get("result", {})
        session["msg_id"] = result.get("message_id")


async def _invoice_create_via_mayar(user_id: int) -> bool:
    """Call scraper's mayar endpoint to create the invoice."""
    session = _invoice_sessions.get(user_id)
    if not session:
        await tg_send(user_id, "❌ Sesi invoice tidak ditemukan.")
        return False

    chat_id = session["chat_id"]
    name = session["name"]
    phone = session.get("phone", "")
    address = session.get("address", "")
    email = session.get("email", "")
    notes = session.get("notes", "")
    payment_type = session.get("payment_type", "LUNAS")
    items = session["items"]
    total_price = sum(i["price"] * i["quantity"] for i in items)

    # Build custom fields for admin reference
    custom_fields = [
        {"key": "user_id", "value": f"admin_{user_id}", "text": "Admin ID"},
        {"key": "telegram_id", "value": str(chat_id), "text": "Telegram Group"},
        {"key": "source", "value": "admin_bot", "text": "Source"},
        {"key": "payment_type", "value": payment_type, "text": "Pembayaran"},
    ]
    if phone:
        custom_fields.append({"key": "phone", "value": phone, "text": "No. WA"})
    if address:
        custom_fields.append({"key": "address", "value": address, "text": "Alamat"})
    if notes:
        custom_fields.append({"key": "notes", "value": notes, "text": "Catatan"})

    # Use real email if provided, otherwise fallback
    use_email = email or os.getenv("MAYAR_DEFAULT_EMAIL", "contact@djiwatentram.com")
    use_mobile = phone or os.getenv("MAYAR_DEFAULT_MOBILE", "081234567890")

    payload = {
        "name": f"Invoice — {name}",
        "description": f"Invoice jastip untuk {name} — {payment_type}",
        "email": use_email,
        "mobile": use_mobile,
        "custom_field": custom_fields,
        "items": items,
        "redirectUrl": "https://mybagasi.my.id/payment/status",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{SCRAPER_URL}/mayar/invoice/create",
                json=payload,
            )
            if not r.is_success:
                error_body = r.text[:500]
                log.error(f"Mayar invoice create failed ({r.status_code}): {error_body}")
                await tg_send(
                    chat_id,
                    f"❌ Gagal create invoice (HTTP {r.status_code}). Coba lagi nanti.",
                )
                return False

            result = r.json()
            mayar_data = result.get("data", result) if isinstance(result, dict) else {}
            invoice_url = (
                mayar_data.get("url")
                or mayar_data.get("link")
                or mayar_data.get("invoice_url")
                or ""
            )
            mayar_id = mayar_data.get("id") or (isinstance(result, dict) and result.get("id", ""))

            # Build nice summary
            items_detail = "\n".join(
                f"• {i['name']} — Rp{i['price']:,} × {i['quantity']}"
                for i in items
            )
            summary = (
                f"✅ *Invoice Berhasil Dibuat!*\n\n"
                f"👤 *{name}*\n"
                f"💰 {payment_type}\n"
                f"━━━━━━━━━━━\n"
                f"{items_detail}\n"
                f"━━━━━━━━━━━\n"
                f"💰 *Total: Rp{total_price:,}*\n\n"
                f"🔗 [Link Invoice]({invoice_url})"
            )

            await tg_send(chat_id, summary)

            if mayar_id:
                log.info(f"Invoice created: {mayar_id} — {invoice_url}")

            # Cleanup session
            _invoice_sessions.pop(user_id, None)
            return True

    except Exception as e:
        log.error(f"invoice_create error: {e}")
        await tg_send(chat_id, f"❌ Error: {e}")
        return False


async def _invoice_cancel(user_id: int, chat_id: int | None = None):
    """Cancel the invoice creation flow."""
    session = _invoice_sessions.pop(user_id, None)
    target = chat_id or (session["chat_id"] if session else user_id)
    await tg_send(target, "❌ Pembuatan invoice dibatalkan.")


# ─── Reply keyboard ───────────────────────────────────────

MAIN_KEYBOARD = {
    "keyboard": [
        [{"text": "🧾 Buat Invoice"}],
        [{"text": "📋 Daftar Pesanan"}],
    ],
    "resize_keyboard": True,
    "one_time_keyboard": False,
}

async def _send_main_keyboard(chat_id: int):
    """Send persistent reply keyboard to admin group."""
    url = f"{API_BASE}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={
                "chat_id": chat_id,
                "text": "🏠 *Menu Admin*\n\nKetuk tombol di bawah untuk mulai:",
                "parse_mode": "Markdown",
                "reply_markup": MAIN_KEYBOARD,
            })
    except Exception as e:
        log.error(f"send_keyboard error: {e}")


# ─── Main bot loop ───────────────────────────────────────

async def send_order_notification(order: dict):
    """Send new order notification to admin group with inline keyboard."""
    items_str = "; ".join(
        f"{it.get('name', '?')} × {it.get('qty', 1)}"
        for it in (order.get("items") or [])
    ) or "Pesanan"
    user_id = order.get('telegram_id', '?')
    total = order.get('total_idr', 0)
    invoice_url = order.get('invoice_url', '')
    order_number = order.get('order_number', '') or order.get('id', '')[:8]
    current_status = order.get('status', 'dipesan')
    emoji = STATUS_EMOJI_MAP.get(current_status, "📌")
    progress = _get_step_progress(current_status)
    
    # Timestamp
    at_raw = order.get('created_at', '')
    try:
        from datetime import datetime
        ts = datetime.fromisoformat(at_raw.replace("Z", "+00:00"))
        timestamp = ts.strftime("%d/%m %H:%M")
    except (ValueError, TypeError, AttributeError):
        timestamp = ""
    
    lines = [f"{emoji} *{STATUS_LABELS.get(current_status, current_status)}*"]
    lines.append(f"━━━ {order_number} ━━━")
    lines.append(f"📦 {items_str}")
    lines.append(f"👤 User: `{user_id}`")
    lines.append(f"💰 Rp{total:,}")
    if invoice_url:
        lines.append(f"🔗 [Invoice]({invoice_url})")
    if timestamp:
        lines.append(f"🕐 {timestamp}")
    lines.append("━━━━━━━━━━━")
    if progress:
        lines.append(progress)
    lines.append("_Tap tombol untuk update_")
    
    text = "\n".join(lines).replace(",", ".")
    
    oid = order.get("id", "")
    keyboard = [
        [{"text": "🔍 Cari di Store", "callback_data": f"order:dicari:{oid}"}],
        [{"text": "❌ Batal (Tidak Ada)", "callback_data": f"order:batal:{oid}"}],
    ]
    
    await tg_send_with_keyboard(ADMIN_GROUP_ID, text, keyboard)


async def handle_command(cmd: str, order_id: str, note: str, chat_id: int, msg_id: int):
    """Handle an admin command."""
    if cmd == "/status" or cmd == "/pesanan":
        orders = await get_orders_list()
        active = [o for o in orders if o["status"] not in ("selesai", "dikirim_ke_user")]
        
        if not active:
            await tg_send(chat_id, "✅ Tidak ada pesanan aktif.")
            return
        
        text = "📋 *Daftar Pesanan Aktif:*\n\n"
        for o in active:
            items = "; ".join(f"{i['name']} × {i['qty']}" for i in (o.get("items") or []))
            label = STATUS_LABELS.get(o["status"], o["status"])
            text += f"• `{o['id'][:8]}…` — {items}\n  {label}\n\n"
        
        await tg_send(chat_id, text)
        return
    
    if not order_id:
        await tg_send(chat_id, f"Gunakan: `{cmd} <order_id>`")
        return
    
    new_status = COMMAND_MAP.get(cmd)
    if not new_status:
        await tg_send(chat_id, f"Perintah tidak dikenal: {cmd}")
        return
    
    result = await update_order_status(order_id, new_status, note)
    if result and result.get("success"):
        label = STATUS_LABELS.get(new_status, new_status)
        await tg_send(chat_id, f"✅ Order `{order_id[:12]}…` → {label}")
    else:
        await tg_send(chat_id, f"❌ Gagal update order `{order_id[:12]}…`. Cek order_id atau coba lagi.")


async def handle_callback(callback_data: str, chat_id: int, msg_id: int, callback_id: str):
    """Handle inline keyboard callback."""
    parts = callback_data.split(":", 2)
    if len(parts) < 2:
        return
    
    action = parts[0]
    if action != "order":
        return
    
    status = parts[1]
    order_id = parts[2] if len(parts) > 2 else ""
    
    result = await update_order_status(order_id, status)
    if result and result.get("success"):
        label = STATUS_LABELS.get(status, status)
        order = result.get("order", {})
        current_status = order.get("status", status)
        await tg_answer_callback(callback_id, f"✅ {label}")
        
        # Build rich order info from returned data
        items_str = "; ".join(
            f"{it.get('name', '?')} × {it.get('qty', 1)}"
            for it in (order.get("items") or [])
        ) or "Pesanan"
        user_id = order.get("telegram_id", "?")
        total = order.get("total_idr", 0)
        emoji = STATUS_EMOJI_MAP.get(current_status, "📌")
        invoice_url = order.get("invoice_url", "") or ""
        order_number = order.get("order_number", "") or order_id[:8]
        progress = _get_step_progress(current_status)
        
        # Get last status history entry for timestamp & notes
        history = order.get("status_history", [])
        last_entry = history[-1] if history else {}
        note = last_entry.get("note", "") or ""
        at_raw = last_entry.get("at", "") or ""
        try:
            from datetime import datetime
            ts = datetime.fromisoformat(at_raw.replace("Z", "+00:00"))
            timestamp = ts.strftime("%d/%m %H:%M")
        except (ValueError, TypeError, AttributeError):
            timestamp = ""
        
        # Tracking number if available
        tracking = order.get("tracking_number") or None
        
        # Build rich message
        lines = [f"{emoji} *{label}*"]
        lines.append(f"━━━ {order_number} ━━━")
        lines.append(f"📦 {items_str}")
        lines.append(f"👤 User: `{user_id}`")
        lines.append(f"💰 Rp{total:,}")
        if invoice_url:
            lines.append(f"🔗 [Invoice]({invoice_url})")
        if tracking:
            lines.append(f"📮 Resi: `{tracking}`")
        if timestamp:
            lines.append(f"🕐 {timestamp}")
        if note:
            lines.append(f"📝 {note}")
        lines.append("━━━━━━━━━━━")
        if progress:
            lines.append(progress)
        lines.append("_Tap tombol untuk update_")
        
        text = "\n".join(lines).replace(",", ".")
        
        # Build next keyboard based on new status
        next_keyboard = _get_next_keyboard(current_status, order_id)
        
        # Update message in-place, no separate confirm message
        url = f"{API_BASE}/editMessageText"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(url, json={
                    "chat_id": chat_id,
                    "message_id": msg_id,
                    "text": text,
                    "parse_mode": "Markdown",
                    "reply_markup": {"inline_keyboard": next_keyboard},
                })
        except Exception:
            pass
    else:
        await tg_answer_callback(callback_id, "❌ Gagal update. Coba lagi.")


def _get_next_keyboard(current_status: str, order_id: str) -> list[list[dict]]:
    """Return inline keyboard buttons for the next step based on current status."""
    oid = order_id
    next_flow = {
        "dipesan": [
            [{"text": "🔍 Cari di Store", "callback_data": f"order:dicari:{oid}"}],
            [{"text": "❌ Batal (Tidak Ada)", "callback_data": f"order:batal:{oid}"}],
        ],
        "dicari": [
            [{"text": "🛒 Ditemukan, Beli!", "callback_data": f"order:dibeli:{oid}"}],
            [{"text": "❌ Batal (Tidak Ada)", "callback_data": f"order:batal:{oid}"}],
        ],
        "dibeli": [
            [{"text": "📦 Sampai Gudang JP", "callback_data": f"order:di_gudang_jp:{oid}"}],
        ],
        "di_gudang_jp": [
            [{"text": "✈️ Kirim ke Indonesia", "callback_data": f"order:dikirim:{oid}"}],
        ],
        "dikirim": [
            [{"text": "🏭 Sampai Indonesia", "callback_data": f"order:di_gudang_id:{oid}"}],
        ],
        "di_gudang_id": [
            [{"text": "📦 Kemas untuk Dikirim", "callback_data": f"order:dikemas:{oid}"}],
        ],
        "dikemas": [
            [{"text": "🚚 Kirim ke User", "callback_data": f"order:dikirim_ke_user:{oid}"}],
        ],
        "dikirim_ke_user": [
            [{"text": "✅ Selesai", "callback_data": f"order:selesai:{oid}"}],
        ],
    }
    return next_flow.get(current_status, [[{"text": "✅ Selesai", "callback_data": "done"}]])


async def get_updates(offset: int = 0) -> tuple[list[dict], int]:
    """Get updates from Telegram."""
    url = f"{API_BASE}/getUpdates"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json={
                "offset": offset,
                "timeout": 30,
                "allowed_updates": ["message", "callback_query"],
            })
            if r.is_success:
                data = r.json()
                return data.get("result", []), offset
    except httpx.TimeoutException:
        pass  # Normal for long polling
    except Exception as e:
        log.error(f"get_updates error: {e}")
    return [], offset


async def check_pending_notifications():
    """Check for new orders that need admin notification."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{SCRAPER_URL}/orders/pending-notifications")
            if not r.is_success:
                return
            
            data = r.json()
            pending = data.get("orders", [])
            
            for order in pending:
                log.info(f"Sending notification for order {order['id'][:12]}...")
                await send_order_notification(order)
                
                # Mark as notified
                await client.post(
                    f"{SCRAPER_URL}/orders/mark-notified",
                    params={"order_id": order["id"]},
                )
                
                await asyncio.sleep(1)  # Avoid flood
        
        if pending:
            log.info(f"Sent {len(pending)} order notification(s)")
    
    except Exception as e:
        log.error(f"check_pending error: {e}")


async def main():
    log.info("Admin Bot starting...")
    log.info(f"Bot token: {BOT_TOKEN[:10]}...")
    log.info(f"Admin group: {ADMIN_GROUP_ID}")
    log.info(f"Scraper URL: {SCRAPER_URL}")
    
    # Send startup keyboard to admin group
    await _send_main_keyboard(ADMIN_GROUP_ID)
    
    offset = 0
    last_notification_check = 0
    notification_interval = 30  # Check every 30 seconds
    
    while True:
        try:
            now = datetime.now(timezone.utc).timestamp()
            
            # Check for pending notifications periodically
            if now - last_notification_check >= notification_interval:
                await check_pending_notifications()
                last_notification_check = now
            
            updates, offset = await get_updates(offset)
            
            for update in updates:
                update_id = update.get("update_id", 0)
                offset = update_id + 1
                
                # Handle callback queries (inline keyboard taps)
                if "callback_query" in update:
                    cq = update["callback_query"]
                    cq_id = cq.get("id", "")
                    data = cq.get("data", "")
                    msg = cq.get("message", {})
                    chat_id = msg.get("chat", {}).get("id", 0)
                    msg_id = msg.get("message_id", 0)
                    
                    if data and data.startswith("order:"):
                        await handle_callback(data, chat_id, msg_id, cq_id)
                    elif data and data.startswith("invoice:create:"):
                        parts = data.split(":", 2)
                        if len(parts) >= 3:
                            uid = int(parts[2])
                            await tg_answer_callback(cq_id, "⏳ Membuat invoice...")
                            await _invoice_create_via_mayar(uid)
                    elif data and data.startswith("invoice:cancel:"):
                        parts = data.split(":", 2)
                        if len(parts) >= 3:
                            uid = int(parts[2])
                            await tg_answer_callback(cq_id, "❌ Dibatalkan")
                            await _invoice_cancel(uid, chat_id)
                    elif data and data.startswith("invpay:"):
                        parts = data.split(":", 2)
                        if len(parts) >= 3:
                            uid = int(parts[2])
                            pay_type = parts[1]
                            label = "DP 50%" if pay_type == "dp" else "LUNAS"
                            await tg_answer_callback(cq_id, f"✅ {label}")
                            await _invoice_handle_payment(uid, pay_type)
                    
                    continue
                
                # Handle messages
                if "message" not in update:
                    continue
                
                msg = update["message"]
                chat_id = msg.get("chat", {}).get("id", 0)
                msg_id = msg.get("message_id", 0)
                text = msg.get("text", "").strip()
                from_id = msg.get("from", {}).get("id", 0)
                
                # Only respond in the admin group
                if chat_id != ADMIN_GROUP_ID:
                    continue
                
                # ── Invoice conversation flow (non-command messages) ──
                if not text.startswith("/"):
                    # Check reply keyboard buttons first
                    if text == "🧾 Buat Invoice":
                        await _invoice_start(from_id, chat_id)
                        continue
                    if text == "📋 Daftar Pesanan":
                        cmd_parsed, order_id, note = parse_command("/pesanan")
                        await handle_command(cmd_parsed, order_id, note, chat_id, msg_id)
                        continue

                    # Invoice state machine
                    if from_id in _invoice_sessions:
                        session = _invoice_sessions[from_id]
                        if session["step"] == "items":
                            await _invoice_handle_item(from_id, text)
                        elif session["step"] in ("name", "phone", "address", "email", "notes"):
                            await _invoice_handle_text(from_id, text)
                        elif session["step"] == "confirm":
                            await tg_send(chat_id, "Gunakan tombol di atas untuk konfirmasi atau batal.")
                        elif session["step"] == "payment_type":
                            await tg_send(chat_id, "Pilih metode pembayaran via tombol di atas ☝️")
                    continue
                
                log.info(f"Command from {chat_id}: {text[:50]}")
                
                # ── Menu / Start ──
                if text.startswith("/start") or text.startswith("/menu"):
                    await _send_main_keyboard(chat_id)
                    continue
                
                # ── Map reply keyboard buttons ──
                if text == "🧾 Buat Invoice":
                    await _invoice_start(from_id, chat_id)
                    continue
                if text == "📋 Daftar Pesanan":
                    cmd = "/pesanan"
                    cmd_parsed, order_id, note = parse_command(cmd)
                    await handle_command(cmd_parsed, order_id, note, chat_id, msg_id)
                    continue
                
                # ── Invoice commands ──
                if text.startswith("/inv") or text.startswith("/invoice"):
                    cmd_clean = text.split()[0].lower()
                    if "@" in cmd_clean:
                        cmd_clean = cmd_clean.split("@")[0]
                    
                    if cmd_clean in ("/inv-cancel", "/invoice-cancel"):
                        await _invoice_cancel(from_id, chat_id)
                    else:
                        await _invoice_start(from_id, chat_id)
                    continue
                
                # ── Regular order commands ──
                cmd, order_id, note = parse_command(text)
                await handle_command(cmd, order_id, note, chat_id, msg_id)
            
            await asyncio.sleep(0.5)
            
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.error(f"Main loop error: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot stopped by user")
