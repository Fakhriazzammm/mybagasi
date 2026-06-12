"""
Order tracking system for MyBagasi.
Tracks orders from dipesan → dibeli → di_gudang_jp → dikirim → di_gudang_id → dikirim_ke_user → selesai
Stores data in a local JSON file.
Auto-expires unpaid bills and converts to orders when paid.
"""
from __future__ import annotations

import os
import json
import uuid as _uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/orders")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ORDERS_FILE = os.path.join(DATA_DIR, "orders.json")
COUNTER_FILE = os.path.join(DATA_DIR, "order_counter.json")

# ─── Order number config ─────────────────────────────────
DEFAULT_ORDER_TYPE = "Jastip"  # Jastip | Bagasi | PO

# ─── Admin config ────────────────────────────────────────
ADMIN_GROUP_ID = os.getenv("ADMIN_TELEGRAM_GROUP_ID", "")
ADMIN_USER_IDS = os.getenv("ADMIN_USER_IDS", "")

# ─── Status lifecycle ──────────────────────────────────────────────
ORDER_STATUSES = [
    "dipesan",           # Order created, awaits confirmation
    "dicari",            # Staff searching in Japanese stores
    "dibeli",            # Item has been purchased in Japan
    "di_gudang_jp",     # Arrived at Japan warehouse
    "dikirim",           # Shipped from Japan to Indonesia
    "di_gudang_id",     # Arrived at Indonesia warehouse
    "dikemas",           # Being packed for delivery to user
    "dikirim_ke_user",  # Shipped to user's address
    "selesai",           # Delivered, completed
    "batal",             # Cancelled — item not found
]

TERMINAL_STATUSES = {"selesai"}  # Cannot transition from these

# Status that can be cancelled (batal)
CANCELABLE_STATUSES = {"dipesan", "dicari"}

STATUS_EMOJI = {
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

STATUS_LABEL = {
    "dipesan": "Dipesan",
    "dicari": "Dicari di Store Jepang",
    "dibeli": "Sudah Dibeli di Jepang",
    "di_gudang_jp": "Sampai di Gudang Jepang",
    "dikirim": "Dikirim ke Indonesia",
    "di_gudang_id": "Sampai di Gudang Indonesia",
    "dikemas": "Dikemas untuk Dikirim",
    "dikirim_ke_user": "Dikirim ke Kamu",
    "selesai": "Selesai",
    "batal": "Dibatalkan",
}


# ─── Helpers ────────────────────────────────────────────────────────


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_orders() -> list[dict]:
    """Load orders from JSON file."""
    _ensure_data_dir()
    if not os.path.exists(ORDERS_FILE):
        return []
    try:
        with open(ORDERS_FILE, "r") as f:
            orders = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []
    return orders


def _save_orders(orders: list[dict]):
    _ensure_data_dir()
    with open(ORDERS_FILE, "w") as f:
        json.dump(orders, f, indent=2, default=str)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_timeline(order: dict) -> list[dict]:
    """Build a structured timeline from order status_history."""
    status_order = {s: i for i, s in enumerate(ORDER_STATUSES)}
    # Sort history by status sequence, then by timestamp
    history = sorted(
        order.get("status_history", []),
        key=lambda h: (status_order.get(h.get("status", ""), 999), h.get("at", "")),
    )
    return history


def _format_timeline_text(history: list[dict]) -> str:
    """Format timeline as readable text with emoji."""
    if not history:
        return "Belum ada update status."

    lines = []
    for entry in history:
        status = entry.get("status", "")
        emoji = STATUS_EMOJI.get(status, "📌")
        label = STATUS_LABEL.get(status, status)
        at_str = ""
        try:
            dt = datetime.fromisoformat(entry["at"].replace("Z", "+00:00"))
            at_str = dt.strftime("%d/%m/%Y %H:%M")
        except (ValueError, TypeError, KeyError):
            at_str = entry.get("at", "")

        note = entry.get("note", "")
        note_str = f" — _{note}_" if note else ""

        lines.append(f"{emoji} *{label}*{note_str}")
        lines.append(f"   🕐 {at_str}")

    return "\n".join(lines)


# ─── Order number generator ─────────────────────────────────


def _get_next_sequence() -> int:
    """Get and increment the order sequence counter."""
    _ensure_data_dir()
    seq = 1
    if os.path.exists(COUNTER_FILE):
        try:
            with open(COUNTER_FILE, "r") as f:
                data = json.load(f)
                seq = (data.get("last_seq", 0) or 0) + 1
        except (json.JSONDecodeError, FileNotFoundError):
            seq = 1
    with open(COUNTER_FILE, "w") as f:
        json.dump({"last_seq": seq}, f)
    return seq


ORDER_TYPE_CODES = {
    "jastip": "J",
    "bagasi": "B",
    "po": "P",
}


def _generate_order_number(
    telegram_id: str,
    user_name: str = "",
    order_type: str = "",
) -> str:
    """Generate order number: MYB{seq:03d}-{typeCode}-{NAME}{DDMMYY}"""
    seq = _get_next_sequence()
    otype = order_type.strip().lower() if order_type else DEFAULT_ORDER_TYPE.lower()
    type_code = ORDER_TYPE_CODES.get(otype, otype[:1].upper())
    
    # Get date in DDMMYY format
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%d%m%y")
    
    # Get user name (uppercase, no spaces)
    name = (user_name or "Customer").strip().replace(" ", "").upper()
    if not name:
        name = f"U{telegram_id[-4:]}" if len(telegram_id) >= 4 else "CUST"
    
    return f"MYB{seq:03d}-{type_code}-{name}{date_str}"


def _get_active_orders(orders: list[dict], telegram_id: str) -> list[dict]:
    """Return orders that are still in progress (not selesai)."""
    return [
        o for o in orders
        if o.get("telegram_id") == telegram_id and o.get("status") != "selesai"
    ]


def _get_completed_orders(orders: list[dict], telegram_id: str) -> list[dict]:
    """Return completed orders."""
    return [
        o for o in orders
        if o.get("telegram_id") == telegram_id and o.get("status") == "selesai"
    ]


# ─── Importable functions for bills_routes ────────────────────────


def create_order_from_bill(bill: dict, user_name: str = "", order_type: str = "") -> dict:
    """
    Create an order from a bill dict.
    Called from bills_routes.py when a bill transitions to 'paid'.
    Returns the created order dict.
    """
    orders = _load_orders()
    now = _now_iso()

    # Check if order already exists for this bill
    for o in orders:
        if o.get("bill_id") == bill.get("id"):
            return o  # Already created

    telegram_id = str(bill.get("telegram_id", ""))
    order_number = _generate_order_number(telegram_id, user_name, order_type)

    new_order = {
        "id": str(_uuid.uuid4()),
        "order_number": order_number,
        "order_type": order_type or DEFAULT_ORDER_TYPE,
        "bill_id": bill.get("id"),
        "telegram_id": telegram_id,
        "items": bill.get("items", []),
        "total_idr": bill.get("total_idr", 0),
        "invoice_url": bill.get("invoice_url", ""),
        "status": "dipesan",
        "status_history": [
            {"status": "dipesan", "at": now, "note": "Pesanan dibuat dari pembayaran tagihan"}
        ],
        "tracking_number": None,
        "admin_notified": False,
        "created_at": now,
        "updated_at": now,
    }

    orders.insert(0, new_order)
    _save_orders(orders)

    # Send notification
    notify_user_status(bill.get("telegram_id", ""), new_order)
    
    # Notify admin group
    notify_admin_new_order(new_order)

    return new_order


def notify_admin_new_order(order: dict):
    """Send notification to admin group about new order."""
    import sys
    if not ADMIN_GROUP_ID:
        print("[ADMIN] Skipped: ADMIN_GROUP_ID is empty", flush=True)
        return
    
    items_summary = "; ".join(
        f"{it.get('name', '?')} × {it.get('qty', 1)}"
        for it in (order.get("items") or [])
    ) or "Pesanan"
    
    text = (
        f"\U0001f195 *ORDER BARU*\n\n"
        f"\U0001f464 User: `{order.get('telegram_id', '?')}`\n"
        f"\U0001f4e6 Item: {items_summary}\n"
        f"\U0001f4b0 Total: Rp{order['total_idr']:,}\n"
        f"\U0001f517 [Invoice]({order.get('invoice_url', '')})\n\n"
        f"Gunakan command di group:\n"
        f"/beli `{order['id']}` — tandai sudah dibeli\n"
        f"/gudang_jp `{order['id']}` — barang sampai gudang JP\n"
        f"/kirim `{order['id']}` — dikirim ke Indonesia"
    ).replace(",", ".")
    
    print(f"[ADMIN] Notify group {ADMIN_GROUP_ID}:", flush=True)
    print(text, flush=True)
    # In production: send to telegram via bot API
    # await send_telegram_message(ADMIN_GROUP_ID, text)


def notify_user_status(telegram_id: str, order: dict):
    """
    Send notification to user about order status update.
    In production, this would send a Telegram message via bot.
    Logs to stdout for now.
    """
    status = order.get("status", "")
    emoji = STATUS_EMOJI.get(status, "📌")
    label = STATUS_LABEL.get(status, status)
    order_id = order.get("id", "")[:8]

    items_str = "; ".join(
        f"{it.get('name', '?')} × {it.get('qty', 1)}"
        for it in (order.get("items") or [])
    ) or "Pesanan"

    message = (
        f"[NOTIFY:{telegram_id}] {emoji} Order #{order_id} — {items_str}\n"
        f"Status: {label}\n"
        f"Total: Rp{order.get('total_idr', 0):,}".replace(",", ".")
    )

    # Log; in production, push to Telegram bot queue
    print(message)


# ─── Helper to transition status with validation ─────────────────


def _transition_status(order: dict, new_status: str, note: str = "", tracking_number: str | None = None) -> dict:
    """Transition an order to a new status, validating the sequence."""
    current = order.get("status", "")
    if current in TERMINAL_STATUSES:
        raise ValueError("Cannot update a completed order")
    
    # Allow any forward or same-status transition
    if new_status not in ORDER_STATUSES:
        raise ValueError(f"Invalid status: {new_status}. Must be one of {ORDER_STATUSES}")
    
    # Special: batal — only from cancelable statuses
    if new_status == "batal" and current not in CANCELABLE_STATUSES:
        raise ValueError(f"Cannot cancel from '{current}'. Only from: {', '.join(sorted(CANCELABLE_STATUSES))}")

    now = _now_iso()
    order["status"] = new_status
    order["updated_at"] = now

    if tracking_number is not None:
        order["tracking_number"] = tracking_number

    # Add to history
    history_entry = {"status": new_status, "at": now, "note": note}
    order.setdefault("status_history", []).append(history_entry)

    return order


# ─── ENDPOINTS ─────────────────────────────────────────────────────


@router.post("/create")
async def order_create(
    telegram_id: str = Query(...),
    bill_id: str = Query(...),
    items_json: str = Query("[]"),
    total_idr: int = Query(...),
    invoice_url: str = Query(""),
    user_name: str = Query(""),
    order_type: str = Query(""),
):
    """Create a new order manually (or from paid bill)."""
    orders = _load_orders()

    # Check duplicate
    for o in orders:
        if o.get("bill_id") == bill_id:
            return {"success": True, "order": o, "message": "Order already exists for this bill"}

    now = _now_iso()
    items = json.loads(items_json) if isinstance(items_json, str) else items_json
    order_number = _generate_order_number(telegram_id, user_name, order_type)

    new_order = {
        "id": str(_uuid.uuid4()),
        "order_number": order_number,
        "order_type": order_type or DEFAULT_ORDER_TYPE,
        "bill_id": bill_id,
        "telegram_id": telegram_id,
        "items": items,
        "total_idr": total_idr,
        "invoice_url": invoice_url,
        "status": "dipesan",
        "status_history": [
            {"status": "dipesan", "at": now, "note": "Pesanan baru dibuat"}
        ],
        "tracking_number": None,
        "created_at": now,
        "updated_at": now,
    }

    orders.insert(0, new_order)
    _save_orders(orders)

    notify_user_status(telegram_id, new_order)

    return {"success": True, "order": new_order}


@router.get("/list")
async def order_list(
    telegram_id: str = Query(...),
):
    """List all orders for a user with active/completed grouping."""
    orders = _load_orders()

    active = _get_active_orders(orders, telegram_id)
    completed = _get_completed_orders(orders, telegram_id)

    # Enrich with remaining_display fields
    for o in active:
        o["remaining_display"] = _format_status_progress(o)
    for o in completed:
        o["remaining_display"] = "✅ Selesai"

    return {
        "success": True,
        "orders": active + completed,  # active first, then completed
        "total_active": len(active),
        "total_completed": len(completed),
    }


@router.get("/track")
async def order_track(
    order_id: str = Query(...),
    telegram_id: str = Query(...),
):
    """Get detailed tracking timeline for a single order."""
    orders = _load_orders()

    order = None
    for o in orders:
        if o.get("id") == order_id and o.get("telegram_id") == telegram_id:
            order = o
            break

    if not order:
        raise HTTPException(status_code=404, detail="Order not found or not yours")

    timeline = _build_timeline(order)
    timeline_text = _format_timeline_text(timeline)

    status = order.get("status", "")
    emoji = STATUS_EMOJI.get(status, "📌")
    label = STATUS_LABEL.get(status, status)
    items_str = "; ".join(
        f"{it.get('name', '?')} × {it.get('qty', 1)}"
        for it in (order.get("items") or [])
    ) or "Pesanan"

    formatted_text = (
        f"{emoji} *Tracking Pesanan*\n"
        f"📦 {items_str}\n"
        f"💰 Rp{order.get('total_idr', 0):,}".replace(",", ".") + "\n"
    )

    if order.get("tracking_number"):
        formatted_text += f"📮 No. Resi: `{order['tracking_number']}`\n"

    formatted_text += f"\n*Status:* {emoji} {label}\n\n"
    formatted_text += "*Timeline:*\n"
    formatted_text += timeline_text

    return {
        "success": True,
        "order": {
            "id": order["id"],
            "bill_id": order.get("bill_id"),
            "status": order["status"],
            "status_label": label,
            "status_emoji": emoji,
            "items": order.get("items", []),
            "total_idr": order.get("total_idr", 0),
            "invoice_url": order.get("invoice_url", ""),
            "tracking_number": order.get("tracking_number"),
            "created_at": order.get("created_at"),
            "updated_at": order.get("updated_at"),
        },
        "timeline": timeline,
        "formatted_text": formatted_text,
    }


@router.post("/update-status")
async def order_update_status(
    order_id: str = Query(...),
    telegram_id: str = Query(...),
    status: str = Query(...),
    note: str = Query(""),
    tracking_number: str | None = Query(None),
):
    """Admin endpoint to update order status."""
    if status not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(ORDER_STATUSES)}",
        )

    orders = _load_orders()
    order = None
    for o in orders:
        if o.get("id") == order_id and o.get("telegram_id") == telegram_id:
            order = o
            break

    if not order:
        raise HTTPException(status_code=404, detail="Order not found or not yours")

    if order.get("status") == "selesai":
        raise HTTPException(status_code=400, detail="Cannot update a completed order")

    try:
        order = _transition_status(order, status, note, tracking_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _save_orders(orders)

    notify_user_status(telegram_id, order)

    return {"success": True, "order": order}


# ─── Admin update (no telegram_id check) ─────────────────


@router.post("/admin-update")
async def order_admin_update(
    order_id: str = Query(...),
    status: str = Query(...),
    note: str = Query(""),
    tracking_number: str | None = Query(None),
):
    """Admin-only endpoint to update order status without telegram_id check."""
    if status not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(ORDER_STATUSES)}",
        )

    orders = _load_orders()
    order = None
    for o in orders:
        if o.get("id") == order_id:
            order = o
            break

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("status") in TERMINAL_STATUSES:
        raise HTTPException(status_code=400, detail="Cannot update a completed order")

    try:
        order = _transition_status(order, status, note, tracking_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _save_orders(orders)
    notify_user_status(order.get("telegram_id", ""), order)

    return {"success": True, "order": order}


# ─── Pending notifications for admin bot ──────────────────


@router.get("/pending-notifications")
async def order_pending_notifications():
    """Get orders that haven't been notified to admin group yet."""
    orders = _load_orders()
    pending = [
        {
            "id": o["id"],
            "telegram_id": o.get("telegram_id", ""),
            "items": o.get("items", []),
            "total_idr": o.get("total_idr", 0),
            "invoice_url": o.get("invoice_url", ""),
            "status": o.get("status", ""),
            "created_at": o.get("created_at", ""),
        }
        for o in orders
        if o.get("status") == "dipesan" and not o.get("admin_notified", False)
    ]
    return {"success": True, "orders": pending, "count": len(pending)}


@router.post("/mark-notified")
async def order_mark_notified(order_id: str = Query(...)):
    """Mark order as notified to admin group."""
    orders = _load_orders()
    for o in orders:
        if o.get("id") == order_id:
            o["admin_notified"] = True
            _save_orders(orders)
            return {"success": True}
    raise HTTPException(status_code=404, detail="Order not found")


@router.post("/webhook-payment")
async def order_webhook_payment(request: Request):
    """
    Webhook from Mayar to auto-create order when payment is received.
    Expects bill_id and telegram_id in the webhook payload.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = body.get("event", "")
    data = body.get("data", {})

    if event == "payment.received" and data.get("status") is True:
        # Try to find bill_id from the payload
        bill_id = data.get("bill_id") or body.get("bill_id")
        telegram_id = data.get("telegram_id") or body.get("telegram_id")
        mayar_invoice_id = data.get("id")

        if not bill_id and mayar_invoice_id:
            # Look up bill by mayar_invoice_id from bills.json
            bills_path = os.path.join(DATA_DIR, "bills.json")
            if os.path.exists(bills_path):
                try:
                    with open(bills_path, "r") as f:
                        bills = json.load(f)
                    for bill in bills:
                        if bill.get("mayar_invoice_id") == mayar_invoice_id:
                            bill_id = bill.get("id")
                            telegram_id = bill.get("telegram_id")
                            break
                except (json.JSONDecodeError, FileNotFoundError):
                    pass

        if bill_id and telegram_id:
            # Load or create order
            orders = _load_orders()
            existing = None
            for o in orders:
                if o.get("bill_id") == bill_id:
                    existing = o
                    break

            if existing:
                return {"success": True, "order_id": existing["id"], "status": "already_exists"}

            # Look up bill for items/total
            bills_path = os.path.join(DATA_DIR, "bills.json")
            bill = None
            if os.path.exists(bills_path):
                try:
                    with open(bills_path, "r") as f:
                        bills = json.load(f)
                    for b in bills:
                        if b.get("id") == bill_id:
                            bill = b
                            break
                except (json.JSONDecodeError, FileNotFoundError):
                    pass

            if bill:
                order = create_order_from_bill(bill)
                return {"success": True, "order_id": order["id"], "status": "created"}
            else:
                # Partial data — create order with available info
                now = _now_iso()
                new_order = {
                    "id": str(_uuid.uuid4()),
                    "bill_id": bill_id,
                    "telegram_id": telegram_id,
                    "items": [],
                    "total_idr": 0,
                    "invoice_url": "",
                    "status": "dipesan",
                    "status_history": [
                        {"status": "dipesan", "at": now, "note": "Pesanan dari webhook pembayaran"}
                    ],
                    "tracking_number": None,
                    "created_at": now,
                    "updated_at": now,
                }
                orders = _load_orders()
                orders.insert(0, new_order)
                _save_orders(orders)
                return {"success": True, "order_id": new_order["id"], "status": "created_partial"}

    return {"success": True, "event": event}


# ─── Helper for remaining_display ─────────────────────────────────


def _format_status_progress(order: dict) -> str:
    """Show progress through the status pipeline."""
    current = order.get("status", "")
    if current == "selesai":
        return "✅ Selesai"

    try:
        idx = ORDER_STATUSES.index(current)
        total = len(ORDER_STATUSES) - 1  # exclude selesai from "remaining" count
        remaining = total - idx
        emoji = STATUS_EMOJI.get(current, "📌")
        if remaining == 0:
            return f"{emoji} Langkah terakhir — selesai"
        return f"{emoji} Langkah {idx+1}/{total} — {remaining} langkah lagi"
    except ValueError:
        return f"{STATUS_EMOJI.get(current, '📌')} {STATUS_LABEL.get(current, current)}"


# ─── Dashboard endpoint ─────────────────────────────────────────────


@router.get("/dashboard")
async def order_dashboard(
    telegram_id: str = Query(...),
):
    """Get orders formatted for web dashboard.
    Returns orders with emoji, labels, timeline, and order_number.
    """
    orders = _load_orders()

    # Filter by telegram_id
    user_orders = [o for o in orders if str(o.get("telegram_id", "")) == telegram_id]

    # Sort: newest first
    user_orders.sort(key=lambda o: o.get("created_at", ""), reverse=True)

    # Format for dashboard
    result = []
    for o in user_orders:
        status = o.get("status", "")
        emoji = STATUS_EMOJI.get(status, "📌")
        label = STATUS_LABEL.get(status, status)

        # Get timeline
        history = o.get("status_history", [])

        # Build items summary
        items_list = []
        for it in (o.get("items") or []):
            items_list.append({
                "name": it.get("name", "?"),
                "qty": it.get("qty", 1),
                "price_jpy": it.get("price_jpy", 0),
            })

        total_idr = o.get("total_idr", 0)

        result.append({
            "id": o.get("id", ""),
            "order_number": o.get("order_number", "") or o["id"][:8],
            "order_type": o.get("order_type", "Jastip"),
            "status": status,
            "status_emoji": emoji,
            "status_label": label,
            "items": items_list,
            "items_summary": "; ".join(f"{it['name']} × {it['qty']}" for it in items_list) if items_list else "Pesanan",
            "total_idr": total_idr,
            "total_display": f"Rp{total_idr:,}".replace(",", "."),
            "invoice_url": o.get("invoice_url", ""),
            "tracking_number": o.get("tracking_number"),
            "timeline": [
                {
                    "status": h["status"],
                    "label": STATUS_LABEL.get(h["status"], h["status"]),
                    "emoji": STATUS_EMOJI.get(h["status"], "📌"),
                    "at": h["at"],
                    "note": h.get("note", ""),
                }
                for h in history
            ],
            "created_at": o.get("created_at", ""),
            "updated_at": o.get("updated_at", ""),
        })

    return {"success": True, "orders": result, "count": len(result)}
