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

_BASE = os.getenv("MAYAR_API_BASE", "https://api.mayar.id/hl/v1")
_KEY = os.getenv("MAYAR_API_KEY", "")
_DEFAULT_EMAIL = os.getenv("MAYAR_DEFAULT_EMAIL", "")
_DEFAULT_MOBILE = os.getenv("MAYAR_DEFAULT_MOBILE", "")
_APP_BASE = os.getenv("APP_BASE_URL", "https://mybagasi.web.id")


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
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{_BASE}/product/{product_id}", headers=_headers())
    _raise(resp)
    return resp.json()


# ─── Invoice ─────────────────────────────────────────────────────────────────

@router.post("/invoice/create")
async def create_invoice(request: Request):
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
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_BASE}/invoice/{invoice_id}", headers=_headers()
        )
    _raise(resp)
    return resp.json()


# ─── Customer ────────────────────────────────────────────────────────────────

@router.post("/customer/create")
async def create_customer(request: Request):
    body = await request.json()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE}/customer/create", headers=_headers(), json=body
        )
    _raise(resp)
    return resp.json()


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
    body = await request.json()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE}/webhook/register", headers=_headers(), json=body
        )
    _raise(resp)
    return resp.json()
