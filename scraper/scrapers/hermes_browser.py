"""
Bagasi AI Browser Bridge — Hermes-powered browser scraping.

Architecture:
  Backend (this module) creates a Supabase scrape_jobs row with
  status "pending_hermes".  A Hermes cron job polls for these rows,
  browses the URL with its browser tools, extracts product data, and
  POSTs the result to /scrape-process.  The /browse-scrape endpoint
  polls Supabase until the result arrives (or times out).

This module provides:
  - hermes_browser_scrape(url)  — async, polls Supabase for result
  - create_hermes_job(url)      — insert pending_hermes row
  - poll_hermes_result(job_id)  — poll until completed/failed
"""
from __future__ import annotations

import os
import uuid
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Any

import httpx

from .models import ProductData, parse_jpy

logger = logging.getLogger("hermes_browser")

# ── Supabase config ──────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Backend URL (self-reference for Hermes callback)
BACKEND_URL = os.getenv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000")

# How long to poll before giving up (seconds)
MAX_POLL_SECONDS = 90
POLL_INTERVAL = 3


def _sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _domain(url: str) -> str:
    from urllib.parse import urlparse
    hostname = urlparse(url).hostname or ""
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname or "generic"


# ── Public API ───────────────────────────────────────────────────────

async def create_hermes_job(url: str, job_type: str = "hermes_browser") -> str:
    """Insert a scrape_jobs row with status 'pending_hermes'. Returns job_id."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase not configured for Hermes browser bridge")

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "id": job_id,
        "url": url,
        "status": "pending_hermes",
        "created_at": now,
        "job_type": job_type,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/scrape_jobs",
            headers=_sb_headers(),
            json=payload,
            timeout=15,
        )

    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Supabase insert failed: {resp.status_code} {resp.text}"
        )

    logger.info(f"Created Hermes browser job {job_id} for {url}")
    return job_id


async def _mark_job_failed(job_id: str, error: str) -> None:
    """Best-effort mark job as failed so rows don't stay pending forever."""
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": "failed",
        "error": error,
        "completed_at": now,
    }
    try:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/scrape_jobs",
                headers=_sb_headers(),
                params={"id": f"eq.{job_id}"},
                json=payload,
                timeout=10,
            )
    except Exception as e:
        logger.warning(f"Failed to mark Hermes job {job_id} as failed: {e}")


async def poll_hermes_result(job_id: str, max_wait: int = MAX_POLL_SECONDS) -> Optional[dict]:
    """Poll Supabase until job is completed/failed or timeout."""
    elapsed = 0
    async with httpx.AsyncClient() as client:
        while elapsed < max_wait:
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/scrape_jobs",
                headers=_sb_headers(),
                params={"id": f"eq.{job_id}", "select": "status,result,error"},
                timeout=10,
            )
            if resp.status_code != 200:
                continue

            rows = resp.json()
            if not rows:
                continue

            row = rows[0]
            status = row.get("status", "")

            if status == "completed":
                return row.get("result")
            if status == "failed":
                logger.warning(f"Hermes job {job_id} failed: {row.get('error')}")
                return None

    logger.warning(f"Hermes job {job_id} timed out after {max_wait}s")
    await _mark_job_failed(
        job_id,
        f"Timed out waiting for Hermes worker after {max_wait}s",
    )
    return None


async def hermes_browser_scrape(
    url: str,
    max_wait: int = MAX_POLL_SECONDS,
) -> Optional[ProductData]:
    """
    Full cycle: create job → poll for result → return ProductData.

    Returns None if the job fails or times out.
    """
    try:
        job_id = await create_hermes_job(url)
    except Exception as e:
        logger.error(f"Failed to create Hermes job: {e}")
        return None

    result = await poll_hermes_result(job_id, max_wait)
    if not result:
        return None

    return _parse_hermes_result(url, result)


def _parse_hermes_result(url: str, result: Any) -> Optional[ProductData]:
    """Convert the Hermes worker's JSON result into a ProductData model."""
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except json.JSONDecodeError:
            return None

    if not isinstance(result, dict):
        return None

    # The Hermes worker should return fields matching ProductData directly
    title = str(result.get("title") or "").strip()
    if not title:
        return None

    price_display = str(result.get("price_display") or "").strip()
    price_jpy = result.get("price_jpy")
    if price_jpy is None and price_display:
        price_jpy = parse_jpy(price_display)

    images = result.get("images", [])
    if isinstance(images, str):
        try:
            images = json.loads(images)
        except json.JSONDecodeError:
            images = []
    if not isinstance(images, list):
        images = []

    marketplace = str(result.get("marketplace") or _domain(url)).strip()

    return ProductData(
        title=title,
        price_jpy=price_jpy,
        price_display=price_display,
        condition=str(result.get("condition") or "").strip() or None,
        images=images,
        description=str(result.get("description") or "").strip() or None,
        seller=str(result.get("seller") or "").strip() or None,
        marketplace=marketplace,
        available=bool(result.get("available", True)),
        url=url,
        confidence=str(result.get("confidence") or "medium").strip().lower(),
        scrape_reason_code="HERMES_BROWSER",
    )
