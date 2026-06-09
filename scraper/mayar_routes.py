"""
Mayar Headless API proxy.
Keeps the API key server-side; frontend calls /mayar/* which Vite proxies here.
"""
from __future__ import annotations

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
    _require_config()
    body: dict = await request.json()

    # Apply defaults for optional fields
    body.setdefault("email", _DEFAULT_EMAIL)
    body.setdefault("mobile", _DEFAULT_MOBILE)
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
    return resp.json()


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


# ─── Webhook receiver (from Mayar → our backend) ────────────────────

@router.post("/webhook/receive")
async def receive_webhook(request: Request):
    """
    Receive webhook callbacks from Mayar (payment.received, etc).
    Updates Supabase order status to 'confirmed' when payment is received.
    """
    body = await request.json()
    event = body.get("event", {}).get("received") or body.get("event")
    data = body.get("data", {})

    # Only process payment.received with status=true (paid)
    if event == "payment.received" and data.get("status") is True:
        custom_fields = data.get("custom_field", []) or []
        order_id = None
        for field in custom_fields:
            if isinstance(field, dict) and field.get("key") == "order_id":
                order_id = field.get("value")
                break

        if order_id:
            supabase_url = os.getenv("SUPABASE_URL", "")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

            if supabase_url and supabase_key:
                headers = {
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                }
                payload = {
                    "status": "confirmed",
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                }
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.patch(
                        f"{supabase_url}/rest/v1/orders",
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
