"""
Bills tracking for MyBagasi.
Stores invoice records in a local JSON file.
Auto-expires unpaid bills after 24 hours.
Shows remaining time for pending bills.
Full CRUD: create, read, update, delete.
"""
from __future__ import annotations

import os
import json
import uuid as _uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from order_routes import create_order_from_bill

router = APIRouter(prefix="/bills")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
BILLS_FILE = os.path.join(DATA_DIR, "bills.json")


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_bills() -> list[dict]:
    """Load bills and auto-expire any that are past due."""
    _ensure_data_dir()
    if not os.path.exists(BILLS_FILE):
        return []
    try:
        with open(BILLS_FILE, "r") as f:
            bills = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []

    # Auto-expire unpaid bills past expires_at
    now = datetime.now(timezone.utc)
    changed = False
    for bill in bills:
        if bill.get("status") == "unpaid" and bill.get("expires_at"):
            try:
                exp = datetime.fromisoformat(bill["expires_at"].replace("Z", "+00:00"))
                if now > exp:
                    bill["status"] = "expired"
                    changed = True
            except (ValueError, TypeError):
                pass

    if changed:
        _save_bills(bills)

    return bills


def _save_bills(bills: list[dict]):
    _ensure_data_dir()
    with open(BILLS_FILE, "w") as f:
        json.dump(bills, f, indent=2, default=str)


def _format_remaining(expires_at: str | None) -> str:
    """Format remaining time from expires_at string. Returns friendly string."""
    if not expires_at:
        return ""
    try:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = exp - now
        total_seconds = int(diff.total_seconds())
        if total_seconds <= 0:
            return "Expired"
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        if hours > 24:
            days = hours // 24
            hours = hours % 24
            return f"{days}h {hours}j"
        if hours > 0:
            return f"{hours}j {minutes}m"
        return f"{minutes}m"
    except (ValueError, TypeError):
        return ""


def _get_mayar_status(mayar_invoice_id: str, api_key: str) -> str | None:
    """Query Mayar API for invoice status."""
    mayar_base = os.getenv("MAYAR_API_BASE") or os.getenv("VITE_MAYAR_API_BASE",
                                                          "https://api.mayar.id/hl/v1")
    try:
        resp = httpx.get(
            f"{mayar_base}/invoice/{mayar_invoice_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        if resp.is_success:
            data = resp.json().get("data", {})
            if data.get("status") is True or data.get("paidAt"):
                return "paid"
            elif data.get("status") is False and data.get("expiredAt"):
                exp = datetime.fromisoformat(data["expiredAt"].replace("Z", "+00:00"))
                if exp < datetime.now(timezone.utc):
                    return "expired"
            return "unpaid"
    except Exception:
        pass
    return None


# ─── CREATE bill ─────────────────────────────────────────

@router.get("/create")
async def bill_create(
    telegram_id: str = Query(...),
    user_id: str = Query(...),
    mayar_invoice_id: str = Query(...),
    invoice_url: str = Query(...),
    total_idr: int = Query(...),
    items_json: str = Query("[]"),
    expires_hours: int = Query(24),
):
    """Record a new bill. Auto-expires in 24 hours (default)."""
    bills = _load_bills()
    new_bill = {
        "id": str(_uuid.uuid4()),
        "telegram_id": telegram_id,
        "user_id": user_id,
        "mayar_invoice_id": mayar_invoice_id,
        "invoice_url": invoice_url,
        "status": "unpaid",
        "total_idr": total_idr,
        "items": json.loads(items_json) if isinstance(items_json, str) else items_json,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat(),
        "paid_at": None,
    }
    bills.insert(0, new_bill)
    _save_bills(bills)

    # Auto-create order from this bill
    created = None
    try:
        created = create_order_from_bill(new_bill)
    except Exception:
        pass  # Order creation is non-critical, don't block bill creation

    return {"success": True, "bill": new_bill, "order_id": created.get("id") if created else None}


# ─── READ list ───────────────────────────────────────────

@router.get("/list")
async def bill_list(
    telegram_id: str = Query(...),
    status: str | None = Query(None),
    auto_refresh: bool = Query(True),
):
    """List bills for a user. Auto-refreshes unpaid from Mayar API."""
    if auto_refresh:
        mayar_key = os.getenv("MAYAR_API_KEY") or os.getenv("VITE_MAYAR_API_KEY", "")
        if mayar_key:
            bills_all = _load_bills()
            for bill in bills_all:
                if bill.get("telegram_id") == telegram_id and bill.get("status") == "unpaid":
                    mid = bill.get("mayar_invoice_id")
                    if mid:
                        try:
                            new_status = _get_mayar_status(mid, mayar_key)
                            if new_status and new_status != bill.get("status"):
                                bill["status"] = new_status
                                if new_status == "paid":
                                    bill["paid_at"] = datetime.now(timezone.utc).isoformat()
                        except Exception:
                            pass
            _save_bills(bills_all)

    bills = _load_bills()
    user_bills = [b for b in bills if b.get("telegram_id") == telegram_id]

    if status and status != "all":
        user_bills = [b for b in user_bills if b.get("status") == status]

    for b in user_bills:
        b["remaining_display"] = _format_remaining(b.get("expires_at"))

    total_unpaid = sum(b.get("total_idr", 0) for b in user_bills if b.get("status") == "unpaid")
    total_paid = sum(b.get("total_idr", 0) for b in user_bills if b.get("status") == "paid")

    return {
        "success": True,
        "bills": user_bills,
        "total_bills": len(user_bills),
        "total_unpaid_idr": total_unpaid,
        "total_paid_idr": total_paid,
    }


# ─── UPDATE bill (PATCH) ─────────────────────────────────

@router.patch("/update")
async def bill_update(
    bill_id: str = Query(...),
    telegram_id: str = Query(...),
    status: str | None = Query(None),
    total_idr: int | None = Query(None),
    invoice_url: str | None = Query(None),
    mayar_invoice_id: str | None = Query(None),
    items_json: str | None = Query(None),
    expires_at: str | None = Query(None),
):
    """Update a bill's fields. Only the owner (telegram_id) can update."""
    bills = _load_bills()
    for bill in bills:
        if bill.get("id") == bill_id and bill.get("telegram_id") == telegram_id:
            if status is not None:
                bill["status"] = status
                if status == "paid":
                    bill["paid_at"] = datetime.now(timezone.utc).isoformat()
            if total_idr is not None:
                bill["total_idr"] = total_idr
            if invoice_url is not None:
                bill["invoice_url"] = invoice_url
            if mayar_invoice_id is not None:
                bill["mayar_invoice_id"] = mayar_invoice_id
            if items_json is not None:
                bill["items"] = json.loads(items_json) if isinstance(items_json, str) else items_json
            if expires_at is not None:
                bill["expires_at"] = expires_at
            _save_bills(bills)
            return {"success": True, "bill": bill}

    raise HTTPException(status_code=404, detail="Bill not found or not yours")


# ─── DELETE bill ─────────────────────────────────────────

@router.delete("/delete")
async def bill_delete(
    bill_id: str = Query(...),
    telegram_id: str = Query(...),
):
    """Delete a bill. Only the owner (telegram_id) can delete."""
    bills = _load_bills()
    original_len = len(bills)
    bills = [b for b in bills if not (b.get("id") == bill_id and b.get("telegram_id") == telegram_id)]

    if len(bills) == original_len:
        raise HTTPException(status_code=404, detail="Bill not found or not yours")

    _save_bills(bills)
    return {"success": True, "message": "Bill deleted"}


# ─── Refresh status from Mayar API ──────────────────────

@router.get("/refresh")
async def bill_refresh(telegram_id: str = Query(...)):
    """Check Mayar API for latest status on all unpaid bills."""
    mayar_key = os.getenv("MAYAR_API_KEY") or os.getenv("VITE_MAYAR_API_KEY", "")
    if not mayar_key:
        return {"success": False, "error": "Mayar API key not configured"}

    bills = _load_bills()
    updated = 0
    for bill in bills:
        if bill.get("telegram_id") == telegram_id and bill.get("status") == "unpaid":
            mid = bill.get("mayar_invoice_id")
            if mid:
                new_status = _get_mayar_status(mid, mayar_key)
                if new_status and new_status != bill.get("status"):
                    bill["status"] = new_status
                    if new_status == "paid":
                        bill["paid_at"] = datetime.now(timezone.utc).isoformat()
                    updated += 1

    if updated > 0:
        _save_bills(bills)

    return {"success": True, "updated": updated, "total_bills": len(bills)}


# ─── Webhook from Mayar ─────────────────────────────────

@router.post("/webhook")
async def bill_webhook(request: Request):
    """Receive webhook from Mayar to mark bill as paid."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = body.get("event", "")
    data = body.get("data", {})

    if event == "payment.received" and data.get("status") is True:
        invoice_id = data.get("id") or body.get("invoice_id")
        if invoice_id:
            bills = _load_bills()
            for bill in bills:
                if bill.get("mayar_invoice_id") == invoice_id and bill.get("status") == "unpaid":
                    bill["status"] = "paid"
                    bill["paid_at"] = datetime.now(timezone.utc).isoformat()
                    _save_bills(bills)
                    return {"success": True, "status": "paid"}

    return {"success": True, "event": event}


# ─── Summary with structured data for inline keyboards ──

@router.get("/summary")
async def bill_summary(telegram_id: str = Query(...)):
    """Get formatted summary + structured bill data for inline keyboard CRUD."""
    bills = _load_bills()
    user_bills = [b for b in bills if b.get("telegram_id") == telegram_id]

    unpaid = [b for b in user_bills if b.get("status") == "unpaid"]
    paid = [b for b in user_bills if b.get("status") == "paid"]
    expired = [b for b in user_bills if b.get("status") == "expired"]

    lines = ["💰 *Tagihan Saya*"]
    now_display = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
    lines.append(f"   {now_display} WIB")
    lines.append("")

    # Build structured bill list for inline keyboards
    bill_list = []

    if not unpaid and not paid:
        lines.append("Belum ada tagihan. Yuk, belanja dulu! 😊")
    elif not unpaid:
        lines.append("✅ Semua tagihan sudah lunas. Makasih! 🎉")
    else:
        lines.append(f"⏳ *{len(unpaid)} Tagihan Belum Dibayar:*")
        lines.append("")
        for i, b in enumerate(unpaid, 1):
            items_str = "; ".join(
                f"{it.get('name', '?')} × {it.get('qty', 1)}"
                for it in (b.get("items") or [])
            ) or f"Pesanan #{i}"
            remaining = _format_remaining(b.get("expires_at"))
            expiry_info = ""
            if remaining:
                expiry_info = f"⏱ Sisa {remaining}"
            else:
                expiry_info = "⏱ Segera bayar"

            lines.append(f"{i}️⃣ *{items_str}*")
            lines.append(f"   💰 Rp{b['total_idr']:,}".replace(",", "."))
            lines.append(f"   📅 {b['created_at'][:10]}")
            lines.append(f"   {expiry_info}")
            lines.append(f"   🔗 [Bayar Sekarang]({b['invoice_url']})")
            lines.append("")

            bill_list.append({
                "id": b["id"],
                "index": i,
                "status": "unpaid",
                "total_idr": b["total_idr"],
                "invoice_url": b["invoice_url"],
                "remaining": remaining,
                "items": b.get("items", []),
            })

    if paid:
        lines.append(f"✅ *{len(paid)} Tagihan Lunas:*")
        for b in paid:
            items_str = "; ".join(
                f"{it.get('name', '?')} × {it.get('qty', 1)}"
                for it in (b.get("items") or [])
            ) or "Pesanan"
            lines.append(f"   • {items_str} — Rp{b['total_idr']:,}".replace(",", "."))
        lines.append("")

    if unpaid:
        lines.append("💡 Yuk, buruan bayar sebelum ⏱ waktu habis! 😊")

    return {
        "success": True,
        "text": "\n".join(lines),
        "bills": bill_list,
        "total_unpaid": len(unpaid),
        "total_paid": len(paid),
    }
