"""
Memory persistence for MyBagasi.
Stores per-user key-value memory in separate JSON files under data/memory/{telegram_id}.json.
All endpoints are GET for compatibility with web_extract agent.
"""
from __future__ import annotations

import os
import json
from datetime import datetime, timezone
from typing import Any

import httpx

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/memory")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MEMORY_DIR = os.path.join(DATA_DIR, "memory")
LINK_PATH = os.path.join(DATA_DIR, "link.json")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _ensure_memory_dir():
    os.makedirs(MEMORY_DIR, exist_ok=True)


def _user_path(telegram_id: str) -> str:
    return os.path.join(MEMORY_DIR, f"{telegram_id}.json")


def _load_user_memory(telegram_id: str) -> dict:
    """Load full memory blob for a user. Returns default structure if not found."""
    _ensure_memory_dir()
    path = _user_path(telegram_id)
    if not os.path.exists(path):
        return {
            "telegram_id": telegram_id,
            "updated_at": None,
            "data": {},
        }
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {
            "telegram_id": telegram_id,
            "updated_at": None,
            "data": {},
        }


def _save_user_memory(memory: dict):
    """Write a full memory blob to disk."""
    _ensure_memory_dir()
    path = _user_path(memory.get("telegram_id", "unknown"))
    memory["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(path, "w") as f:
        json.dump(memory, f, indent=2, default=str)


async def _sync_to_supabase(telegram_id: str, memory: dict):
    """Sync memory data to Supabase profiles table for linked users. Graceful on failure."""
    if not SUPABASE_URL or not SERVICE_KEY:
        return  # Supabase not configured — skip silently

    try:
        if not os.path.exists(LINK_PATH):
            return
        with open(LINK_PATH, "r") as f:
            links = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return  # Can't read links — skip

    auth_id = links.get(telegram_id)
    if not auth_id:
        return  # User not linked — nothing to sync

    url = f"{SUPABASE_URL}/rest/v1/profiles"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"memory": json.dumps(memory)}

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.patch(
                url,
                headers=headers,
                params={"id": f"eq.{auth_id}"},
                json=payload,
            )
        # Log non-2xx but don't raise — graceful degradation
        if resp.status_code >= 400:
            print(f"[memory_sync] Supabase patch returned {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:
        print(f"[memory_sync] Supabase sync failed for {telegram_id}: {exc}")
        # Graceful — JSON already saved, no re-raise


# ─── Save a key-value pair ──────────────────────────────

@router.get("/save")
async def memory_save(
    telegram_id: str = Query(...),
    key: str = Query(...),
    value: str = Query(...),
):
    """Save a single key-value pair to the user's memory. Overwrites if key exists."""
    memory = _load_user_memory(telegram_id)
    memory["data"][key] = value
    _save_user_memory(memory)
    await _sync_to_supabase(telegram_id, memory)
    return {
        "success": True,
        "telegram_id": telegram_id,
        "key": key,
        "value": value,
    }


# ─── Load all memory for a user ─────────────────────────

@router.get("/load")
async def memory_load(
    telegram_id: str = Query(...),
):
    """Load ALL key-value memory for a user. Returns empty object if none saved."""
    memory = _load_user_memory(telegram_id)
    return {
        "success": True,
        "telegram_id": telegram_id,
        "data": memory.get("data", {}),
    }


# ─── Delete a specific key ─────────────────────────────

@router.get("/delete")
async def memory_delete(
    telegram_id: str = Query(...),
    key: str = Query(...),
):
    """Delete a specific key from the user's memory."""
    memory = _load_user_memory(telegram_id)
    data = memory.get("data", {})

    if key not in data:
        return {
            "success": False,
            "telegram_id": telegram_id,
            "error": f"Key '{key}' not found",
        }

    del data[key]
    _save_user_memory(memory)
    return {
        "success": True,
        "telegram_id": telegram_id,
        "key": key,
    }


# ─── Clear all memory for a user ───────────────────────

@router.get("/clear")
async def memory_clear(
    telegram_id: str = Query(...),
):
    """Delete the user's entire memory file."""
    _ensure_memory_dir()
    path = _user_path(telegram_id)

    if os.path.exists(path):
        os.remove(path)
        return {
            "success": True,
            "telegram_id": telegram_id,
            "message": "Memory cleared",
        }

    return {
        "success": True,
        "telegram_id": telegram_id,
        "message": "No memory to clear",
    }
