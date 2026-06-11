"""
Cart CRUD endpoints for MyBagasi.
All endpoints use GET for web_extract compatibility.
Uses JSON file storage (same pattern as bills_routes).

User identification: uses telegram_id directly (string/numeric).
PER-USER ISOLATED: every operation filters by telegram_id.
No Supabase Auth dependency — works for any Telegram user.
"""
from __future__ import annotations

import os
import json
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/cart")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CART_FILE = os.path.join(DATA_DIR, "cart.json")


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_cart() -> list[dict]:
    _ensure_data_dir()
    if not os.path.exists(CART_FILE):
        return []
    try:
        with open(CART_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def _save_cart(items: list[dict]):
    _ensure_data_dir()
    with open(CART_FILE, "w") as f:
        json.dump(items, f, indent=2, default=str)


def _user_items(items: list[dict], telegram_id: str) -> list[dict]:
    """Filter items for a specific user."""
    return [i for i in items if str(i.get("telegram_id", "")) == str(telegram_id)]


def _find_item(items: list[dict], item_id: str, telegram_id: str) -> dict | None:
    """Find an item by id, verifying it belongs to the user."""
    for i in items:
        if str(i.get("id", "")) == item_id and str(i.get("telegram_id", "")) == str(telegram_id):
            return i
    return None


# ─── GET cart items ──────────────────────────────────────

@router.get("/list")
async def cart_list(telegram_id: str = Query(...)):
    """Get all items in user's cart. PER-USER FILTERED."""
    all_items = _load_cart()
    items = _user_items(all_items, telegram_id)
    items.sort(key=lambda x: x.get("created_at", ""))

    total_jpy = sum(
        (item.get("price_jpy", 0) or 0) * max(item.get("quantity", 1), 1)
        for item in items
    )
    return {
        "success": True,
        "items": items,
        "total_items": len(items),
        "total_jpy": total_jpy,
    }


# ─── ADD item to cart ────────────────────────────────────

@router.get("/add")
async def cart_add(
    telegram_id: str = Query(...),
    product_name: str = Query(...),
    price_jpy: int = Query(...),
    url: str | None = Query(None),
    image_url: str | None = Query(None),
    quantity: int = Query(1),
    notes: str | None = Query(None),
):
    """Add item to cart. If same product_name exists, increment quantity.
    PER-USER: item linked to telegram_id.
    """
    items = _load_cart()
    user_items = _user_items(items, telegram_id)

    # Check existing product (same name, same user)
    existing = None
    for i in user_items:
        if i.get("product_name") == product_name:
            existing = i
            break

    if existing:
        existing["quantity"] = (existing.get("quantity", 1) or 1) + quantity
        existing["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_cart(items)
        return {
            "success": True,
            "action": "updated",
            "item_id": existing["id"],
            "quantity": existing["quantity"],
        }

    now = datetime.now(timezone.utc).isoformat()
    new_item = {
        "id": str(_uuid.uuid4()),
        "telegram_id": telegram_id,
        "product_name": product_name,
        "price_jpy": price_jpy,
        "url": url or "",
        "image_url": image_url or "",
        "quantity": max(quantity, 1),
        "source": "telegram_bot",
        "notes": notes or "",
        "created_at": now,
        "updated_at": now,
    }
    items.append(new_item)
    _save_cart(items)
    return {
        "success": True,
        "action": "added",
        "item_id": new_item["id"],
        "quantity": new_item["quantity"],
    }


# ─── UPDATE item quantity ────────────────────────────────

@router.get("/update")
async def cart_update(
    telegram_id: str = Query(...),
    item_id: str = Query(...),
    quantity: int = Query(..., ge=1, le=99),
):
    """Update item quantity. Verifies item belongs to user first."""
    items = _load_cart()
    item = _find_item(items, item_id, telegram_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in your cart")

    item["quantity"] = quantity
    item["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_cart(items)
    return {
        "success": True,
        "item_id": item_id,
        "product_name": item.get("product_name"),
        "quantity": quantity,
    }


# ─── DELETE item from cart ───────────────────────────────

@router.get("/delete")
async def cart_delete(
    telegram_id: str = Query(...),
    item_id: str = Query(...),
):
    """Remove item from cart. Verifies item belongs to user first."""
    items = _load_cart()
    item = _find_item(items, item_id, telegram_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in your cart")

    items[:] = [i for i in items if not (str(i.get("id", "")) == item_id
                                          and str(i.get("telegram_id", "")) == str(telegram_id))]
    _save_cart(items)
    return {"success": True, "action": "deleted", "item_id": item_id}


# ─── CLEAR all items for user ────────────────────────────

@router.get("/clear")
async def cart_clear(telegram_id: str = Query(...)):
    """Remove all items from user's cart. PER-USER: only clears this user's items."""
    items = _load_cart()
    items[:] = [i for i in items if str(i.get("telegram_id", "")) != str(telegram_id)]
    _save_cart(items)
    return {"success": True, "action": "cleared", "telegram_id": telegram_id}
