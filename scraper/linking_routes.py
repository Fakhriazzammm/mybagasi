"""
Linking routes for MyBagasi.
Maps telegram_id ↔ Supabase auth user_id in data/link.json.
"""
from __future__ import annotations

import os
import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/auth")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LINK_PATH = os.path.join(DATA_DIR, "link.json")


# ── Pydantic models ──────────────────────────────────────

class LinkRequest(BaseModel):
    telegram_id: str
    auth_id: str | None = None


class UnlinkRequest(BaseModel):
    telegram_id: str


# ── Helpers ──────────────────────────────────────────────

def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_links() -> dict[str, str]:
    """Load the full link mapping. Returns {} if file missing/corrupt."""
    _ensure_data_dir()
    if not os.path.exists(LINK_PATH):
        return {}
    try:
        with open(LINK_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def _save_links(links: dict[str, str]):
    """Write the full link mapping to disk."""
    _ensure_data_dir()
    with open(LINK_PATH, "w") as f:
        json.dump(links, f, indent=2)


# ── POST /auth/link ──────────────────────────────────────

@router.post("/link")
async def link_account(req: LinkRequest):
    """
    Link a Telegram ID to a Supabase auth user ID.
    - If the telegram_id is already linked, the mapping is updated.
    - Returns action: "linked" for new, "updated" for overwrite.
    """
    if not req.telegram_id or not req.auth_id:
        raise HTTPException(status_code=400, detail="telegram_id and auth_id are required")

    links = _load_links()
    action = "updated" if req.telegram_id in links else "linked"
    links[req.telegram_id] = req.auth_id
    _save_links(links)

    return {
        "success": True,
        "action": action,
        "telegram_id": req.telegram_id,
        "auth_id": req.auth_id,
    }


# ── GET /auth/link?telegram_id=... ───────────────────────

@router.get("/link")
async def get_link_status(
    telegram_id: str = Query(...),
):
    """
    Check linking status for a specific Telegram ID.
    Returns whether the user is linked and their auth_id (if linked).
    """
    links = _load_links()
    auth_id = links.get(telegram_id)

    return {
        "success": True,
        "linked": auth_id is not None,
        "telegram_id": telegram_id,
        "auth_id": auth_id,
    }


# ── POST /auth/unlink ────────────────────────────────────

@router.post("/unlink")
async def unlink_account(req: UnlinkRequest):
    """
    Remove the link for a Telegram ID.
    Idempotent — succeeds even if the user was not linked.
    """
    if not req.telegram_id:
        raise HTTPException(status_code=400, detail="telegram_id is required")

    links = _load_links()
    links.pop(req.telegram_id, None)
    _save_links(links)

    return {
        "success": True,
        "telegram_id": req.telegram_id,
    }
