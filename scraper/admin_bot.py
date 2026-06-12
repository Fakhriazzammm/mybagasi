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
                    
                    continue
                
                # Handle messages
                if "message" not in update:
                    continue
                
                msg = update["message"]
                chat_id = msg.get("chat", {}).get("id", 0)
                msg_id = msg.get("message_id", 0)
                text = msg.get("text", "").strip()
                
                # Only respond in the admin group
                if chat_id != ADMIN_GROUP_ID:
                    continue
                
                # Only respond to messages that look like commands
                if not text.startswith("/"):
                    continue
                
                log.info(f"Command from {chat_id}: {text[:50]}")
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
