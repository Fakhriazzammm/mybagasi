"""
Mayar Headless API proxy.
Keeps the API key server-side; frontend calls /mayar/* which Vite proxies here.

When invoice is created:
  1. Forward to Mayar API to get invoice_id + invoice_url
  2. Also save to Supabase bills table for tagihan tracking (with user_id + telegram_id)

Webhook receiver:
  - On payment.received: update Supabase bills table (status=paid) + create order
"""
from __future__ import annotations

import json as _json
import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/mayar")

_BASE = os.getenv("MAYAR_API_BASE") or os.getenv("VITE_MAYAR_API_BASE")
_KEY = os.getenv("MAYAR_API_KEY") or os.getenv("VITE_MAYAR_API_KEY") or ""
_DEFAULT_EMAIL = os.getenv("MAYAR_DEFAULT_EMAIL") or os.getenv("VITE_MAYAR_DEFAULT_EMAIL") or ""
_DEFAULT_MOBILE = os.getenv("MAYAR_DEFAULT_MOBILE") or os.getenv("VITE_MAYAR_DEFAULT_MOBILE") or ""
_APP_BASE = os.getenv("APP_BASE_URL") or os.getenv("VITE_APP_BASE_URL")

_SUPABASE_URL = os.getenv("SUPABASE_URL", "")
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _require_config() -> None:
    missing = []
    if not _BASE:
        missing.append("MAYAR_API_BASE")
    if not _KEY:
        missing.append("MAYAR_API_KEY")
    if not _APP_BASE:
        missing.append("APP_BASE_URL")
    if missing:
        raise HTTPException(status_code=500, detail=f"Missing backend config: {', '.join(missing)}")

def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_KEY}",
        "Content-Type": "application/json",
    }

def _raise(resp: httpx.Response) -> None:
    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)

def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": _SUPABASE_KEY,
        "Authorization": f"Bearer {_SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

async def _save_bill_to_supabase(bill_data: dict) -> bool:
    """Insert a bill record into Supabase bills table. Returns True on success."""
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{_SUPABASE_URL}/rest/v1/bills",
                headers=_supabase_headers(),
                json=bill_data,
            )
            return r.status_code in (200, 201)
    except Exception as e:
        print(f"[BILLS] Failed to save bill: {e}")
        return False

async def _update_bill_status(mayar_invoice_id: str, status: str, paid_at: str | None = None,
                               mayar_transaction_id: str | None = None) -> bool:
    """Update a bill's status in Supabase by mayar_invoice_id."""
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        return False
    try:
        payload = {"status": status}
        if paid_at:
            payload["paid_at"] = paid_at
        if mayar_transaction_id:
            payload["mayar_transaction_id"] = mayar_transaction_id

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.patch(
                f"{_SUPABASE_URL}/rest/v1/bills",
                headers=_supabase_headers(),
                params={"mayar_invoice_id": f"eq.{mayar_invoice_id}"},
                json=payload,
            )
            return r.status_code in (200, 204)
    except Exception as e:
        print(f"[BILLS] Failed to update bill: {e}")
        return False


# ─── Products ────────────────────────────────────────────────────────────────

@router.get("/products")
async def list_products(page: int = 1, pageSize: int = 10):
    _require_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_BASE}/product",
            headers=_headers(),
            params={"page": page, "pageSize": pageSize},
        )
    _raise(resp)
    return resp.json()


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    _require_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{_BASE}/product/{product_id}", headers=_headers())
    _raise(resp)
    return resp.json()


# ─── Invoice ─────────────────────────────────────────────────────────────────

@router.post("/invoice/create")
async def create_invoice(request: Request):
    """Create invoice in Mayar AND save to Supabase bills table."""
    _require_config()
    body: dict = await request.json()

    # Extract bill metadata from custom_fields (sent from telegram_bot.py)
    user_id = None
    telegram_id = None
    items_summary = []
    custom_fields = body.get("custom_field", []) or []
    for field in custom_fields:
        if isinstance(field, dict):
            if field.get("key") == "user_id":
                user_id = field.get("value")
            elif field.get("key") == "telegram_id":
                telegram_id = field.get("value")

    # Apply defaults for optional fields
    body.setdefault("email", _DEFAULT_EMAIL)
    body.setdefault("mobile", _DEFAULT_MOBILE)
    body.setdefault("description", body.get("name", "Invoice"))
    if not body.get("items"):
        body["items"] = [
            {
                "name": body.get("name", "Product"),
                "description": body.get("description", ""),
                "quantity": 1,
                "price": body.get("amount", 0),
                "rate": body.get("amount", 0),
            }
        ]
    if not body.get("redirectUrl"):
        body["redirectUrl"] = f"{_APP_BASE}/payment/status"
    if not body.get("expiredAt"):
        expires = datetime.now(timezone.utc) + timedelta(hours=24)
        body["expiredAt"] = expires.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE}/invoice/create", headers=_headers(), json=body
        )
    _raise(resp)
    mayar_result = resp.json()

    # ── Save to Supabase bills table ──
    if user_id:
        mayar_data = mayar_result.get("data", {}) if isinstance(mayar_result, dict) else {}
        mayar_invoice_id = mayar_data.get("id") or (isinstance(mayar_result, dict) and mayar_result.get("id"))
        invoice_url = mayar_data.get("url") or mayar_data.get("link") or mayar_data.get("invoice_url")

        # Build items_summary from invoice items
        invoice_items = body.get("items", [])
        for item in invoice_items:
            items_summary.append({
                "name": item.get("name", ""),
                "quantity": item.get("quantity", 1),
                "price": item.get("price", 0),
            })

        total_idr = sum(
            item.get("price", 0) * item.get("quantity", 1)
            for item in invoice_items
        )

        bill_record = {
            "user_id": user_id,
            "telegram_id": telegram_id,
            "mayar_invoice_id": mayar_invoice_id or "",
            "invoice_url": invoice_url or "",
            "status": "unpaid",
            "total_idr": total_idr,
            "total_jpy": 0,
            "items_summary": _json.dumps(items_summary),
            "expires_at": body.get("expiredAt"),
        }

        saved = await _save_bill_to_supabase(bill_record)
        if saved:
            print(f"[BILLS] Bill saved to Supabase: {mayar_invoice_id} for user {user_id[:8]}")
        else:
            print(f"[BILLS] Failed to save bill for user {user_id[:8]}")

    return mayar_result


# GET endpoint for web_extract tool (agent without curl/terminal)
@router.get("/invoice/create")
async def create_invoice_get(
    name: str,
    amount: int,
    email: str | None = None,
    mobile: str | None = None,
):
    _require_config()
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    body = {
        "name": name,
        "description": name,
        "items": [
            {
                "name": name,
                "description": name,
                "quantity": 1,
                "price": amount,
                "rate": amount,
            }
        ],
        "email": email or _DEFAULT_EMAIL,
        "mobile": mobile or _DEFAULT_MOBILE,
        "redirectUrl": f"{_APP_BASE}/payment/status",
        "expiredAt": expires.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE}/invoice/create", headers=_headers(), json=body
        )
    _raise(resp)
    data = resp.json()
    # Extract invoice URL for easy access
    _invoice_url = None
    if isinstance(data, dict):
        _data = data.get("data", {})
        if isinstance(_data, dict):
            _invoice_url = _data.get("url") or _data.get("link") or _data.get("invoice_url")
    return {"_invoice_url": _invoice_url, "response": data}


@router.get("/invoice/{invoice_id}")
async def get_invoice(invoice_id: str):
    _require_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_BASE}/invoice/{invoice_id}", headers=_headers()
        )
    _raise(resp)
    return resp.json()


# ─── Customer ────────────────────────────────────────────────────────────────

@router.post("/customer/create")
async def create_customer(request: Request):
    _require_config()
    body = await request.json()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE}/customer/create", headers=_headers(), json=body
        )
    _raise(resp)
    return resp.json()


# ─── Webhook receiver (from Mayar -> our backend) ────────────────────

@router.get("/webhook/receive")
async def receive_webhook_get():
    """GET handler for webhook URL verification by Mayar."""
    return {"status": "ok", "message": "Webhook endpoint active (POST for payment notifications)"}

@router.post("/webhook/receive")
async def receive_webhook(request: Request):
    """
    Receive webhook callbacks from Mayar (payment.received, etc).
    Updates Supabase bills table + order status when payment is received.
    """
    body = await request.json()
    event = body.get("event", {})
    data = body.get("data", {})

    # Only process payment.received with status=true (paid)
    if event == "payment.received" and data.get("status") is True:
        custom_fields = data.get("custom_field", []) or []
        order_id = None
        user_id = None
        telegram_id = None
        for field in custom_fields:
            if isinstance(field, dict):
                if field.get("key") == "order_id":
                    order_id = field.get("value")
                elif field.get("key") == "user_id":
                    user_id = field.get("value")
                elif field.get("key") == "telegram_id":
                    telegram_id = field.get("value")

        # Extract mayar invoice id for bill lookup
        invoice_id = data.get("id")
        transaction_id = data.get("transaction_id") or data.get("invoice_id")
        paid_at_str = datetime.now(timezone.utc).isoformat()

        # ── Update Supabase bills table ──
        if invoice_id and _SUPABASE_URL and _SUPABASE_KEY:
            updated = await _update_bill_status(
                mayar_invoice_id=invoice_id,
                status="paid",
                paid_at=paid_at_str,
                mayar_transaction_id=transaction_id,
            )
            if updated:
                print(f"[BILLS] Bill {invoice_id} marked as paid")
        # ── Update Supabase orders table ──
        if order_id and _SUPABASE_URL and _SUPABASE_KEY:
            headers = _supabase_headers()
            payload = {
                "status": "confirmed",
                "paid_at": paid_at_str,
            }
            async with httpx.AsyncClient(timeout=10) as client:
                await client.patch(
                    f"{_SUPABASE_URL}/rest/v1/orders",
                    headers=headers,
                    params={"id": f"eq.{order_id}"},
                    json=payload,
                )

    return {"status": "ok"}


# ─── Webhook history ─────────────────────────────────────────────────────────

@router.get("/webhook/history")
async def webhook_history(
    page: int = 1,
    pageSize: int = 10,
    status: str | None = None,
    type: str | None = None,
    startAt: str | None = None,
    endAt: str | None = None,
):
    _require_config()
    params: dict = {"page": page, "pageSize": pageSize}
    for k, v in [("status", status), ("type", type), ("startAt", startAt), ("endAt", endAt)]:
        if v:
            params[k] = v

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_BASE}/webhook/history", headers=_headers(), params=params
        )
    _raise(resp)
    return resp.json()


@router.post("/webhook/register")
async def register_webhook(request: Request):
    _require_config()
    body = await request.json()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE}/webhook/register", headers=_headers(), json=body
        )
    _raise(resp)
    return resp.json()
