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

from fastapi import APIRouter, HTTPException, Query

from db import db

router = APIRouter(prefix="/memory")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MEMORY_DIR = os.path.join(DATA_DIR, "memory")
LINK_PATH = os.path.join(DATA_DIR, "link.json")


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
    """Sync memory data to the profiles table via db helper. Graceful on failure."""
    try:
        profile = db.get("profiles", {"telegram_id": str(telegram_id)})
        if profile is None:
            return  # No matching profile — nothing to sync
        db.update(
            "profiles",
            {"memory": json.dumps(memory)},
            "telegram_id",
            str(telegram_id),
        )
    except Exception as exc:
        print(f"[memory_sync] Sync failed for {telegram_id}: {exc}")
        # Graceful — JSON already saved to disk, no re-raise


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
