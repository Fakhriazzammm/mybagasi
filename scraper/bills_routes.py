"""
Bills tracking for MyBagasi.
Stores invoice records in a local JSON file (works with worker=1).
Can be migrated to Supabase table later when DB access is available.
"""
from __future__ import annotations

import os
import json
import uuid as _uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/bills")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
BILLS_FILE = os.path.join(DATA_DIR, "bills.json")
_LOCK = None  # Simple in-memory lock for concurrent access


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_bills() -> list[dict]:
    _ensure_data_dir()
    if not os.path.exists(BILLS_FILE):
        return []
    try:
        with open(BILLS_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def _save_bills(bills: list[dict]):
    _ensure_data_dir()
    with open(BILLS_FILE, "w") as f:
        json.dump(bills, f, indent=2, default=str)


def _get_mayar_status(mayar_invoice_id: str, api_key: str) -> str | None:
    """Query Mayar API for invoice status. Returns status or None if error."""
    mayar_base = os.getenv("MAYAR_API_BASE") or os.getenv("VITE_MAYAR_API_BASE", "https://api.mayar.id/hl/v1")
    try:
        import httpx
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


# ─── Create a bill (after Mayar invoice is created) ─────

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
    """Record a new bill after Mayar invoice creation."""
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
    return {"success": True, "bill": new_bill}


# ─── List unpaid bills for a user ───────────────────────

@router.get("/list")
async def bill_list(
    telegram_id: str = Query(...),
    status: str | None = Query(None),
    auto_refresh: bool = Query(True),
):
    """List bills for a user. Auto-refreshes from Mayar API first."""
    # Auto-refresh unpaid bills from Mayar API
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

    total_unpaid = sum(b.get("total_idr", 0) for b in user_bills if b.get("status") == "unpaid")
    total_paid = sum(b.get("total_idr", 0) for b in user_bills if b.get("status") == "paid")

    return {
        "success": True,
        "bills": user_bills,
        "total_bills": len(user_bills),
        "total_unpaid_idr": total_unpaid,
        "total_paid_idr": total_paid,
    }


# ─── Refresh status from Mayar API ─────────────────────

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


# ─── Mark bill as paid (webhook callback) ───────────────

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


# ─── Get bill summary for display ──────────────────────

@router.get("/summary")
async def bill_summary(telegram_id: str = Query(...)):
    """Get formatted summary of all bills."""
    bills = _load_bills()
    user_bills = [b for b in bills if b.get("telegram_id") == telegram_id]

    unpaid = [b for b in user_bills if b.get("status") == "unpaid"]
    paid = [b for b in user_bills if b.get("status") == "paid"]

    lines = ["📋 TAGIHAN SAYA\n"]

    if not unpaid:
        lines.append("✅ Tidak ada tagihan yang belum dibayar.\n")
    else:
        lines.append(f"⏳ **{len(unpaid)} Tagihan Belum Dibayar:**\n")
        for i, b in enumerate(unpaid, 1):
            items_str = "; ".join(
                f"{it.get('name','?')} × {it.get('qty',1)}"
                for it in (b.get("items") or [])
            ) or "1 item"
            lines.append(f"{i}. **{items_str}**")
            lines.append(f"   💰 Rp{b['total_idr']:,}")
            lines.append(f"   📅 {b['created_at'][:10]}")
            lines.append(f"   🔗 [Bayar Sekarang]({b['invoice_url']})")
            lines.append("")

    if paid:
        lines.append(f"✅ **{len(paid)} Tagihan Lunas:**\n")
        lines.append(f"   Total: Rp{sum(b['total_idr'] for b in paid):,}")

    lines.append("\n💡 Klik link bayar untuk lunasi tagihan.")
    return {"success": True, "text": "\n".join(lines)}
