"""
Catalog search & discovery routes for MyBagasi.
Exposes search, category browsing, category listing, and featured products
from the Supabase `catalog_items` table.
"""
from __future__ import annotations

import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/catalog")

# ── Supabase config ──────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Try to read the Management API access token from the local file
# (needed for raw-SQL full-text search queries)
_SUPABASE_ACCESS_TOKEN: str | None = None
_access_token_path = os.path.expanduser("~/.supabase/access-token")
if os.path.isfile(_access_token_path):
    try:
        with open(_access_token_path) as _f:
            _SUPABASE_ACCESS_TOKEN = _f.read().strip()
    except Exception:
        pass

TABLE = "catalog_items"


def _extract_ref(url: str) -> str:
    """Extract project ref from Supabase URL like https://<ref>.supabase.co."""
    m = re.search(r"https?://([^.]+)\.supabase\.co", url)
    return m.group(1) if m else ""


PROJECT_REF = _extract_ref(SUPABASE_URL) if SUPABASE_URL else ""


# ── Shared helpers ───────────────────────────────────────────────────

def _sb_headers(extra: dict | None = None) -> dict:
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if extra:
        h.update(extra)
    return h


# ══════════════════════════════════════════════════════════════════════
# 1. GET /search  —  Full-text search with ILIKE fallback
# ══════════════════════════════════════════════════════════════════════

@router.get("/search")
async def catalog_search(
    keyword: str = Query(...),
    category: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Search catalog_items using full-text search (Indonesian), with
    ILIKE fallback for partial matching."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    keyword = keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    # ── Attempt 1: Full-text search via Management API SQL endpoint ──
    if _SUPABASE_ACCESS_TOKEN and PROJECT_REF:
        items, total = await _fts_search(keyword, category, limit)
        if items:
            return {"items": items, "total": total}

    # ── Attempt 2: ILIKE fallback via Supabase REST API ─────────────
    items, total = await _ilike_search(keyword, category, limit)
    return {"items": items, "total": total}


async def _fts_search(
    keyword: str, category: str | None, limit: int
) -> tuple[list[dict], int]:
    """PostgreSQL full-text search via Management API SQL endpoint."""
    safe_keyword = keyword.replace("'", "''")
    ts_query = f"plainto_tsquery('indonesian', '{safe_keyword}')"
    ts_vector = (
        "to_tsvector('indonesian', "
        "COALESCE(name,'') || ' ' || COALESCE(description,'') || ' ' "
        "|| COALESCE(category,'') || ' ' || COALESCE(sub_category,'')"
        ")"
    )

    safe_cat = category.replace("'", "''") if category else ""
    cat_filter = f" AND category = '{safe_cat}'" if category else ""

    count_sql = (
        f"SELECT COUNT(*) AS cnt FROM {TABLE} "
        f"WHERE active = TRUE AND {ts_vector} @@ {ts_query}{cat_filter}"
    )
    data_sql = (
        f"SELECT * FROM {TABLE} "
        f"WHERE active = TRUE AND {ts_vector} @@ {ts_query}{cat_filter} "
        f"ORDER BY name LIMIT {limit}"
    )

    management_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    mgmt_headers = {
        "Authorization": f"Bearer {_SUPABASE_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Count query
            resp_c = await client.post(
                management_url, headers=mgmt_headers, json={"query": count_sql}
            )
            if resp_c.status_code >= 400:
                return [], 0
            count_data = resp_c.json()
            total = count_data[0]["cnt"] if count_data else 0

            if total == 0:
                return [], 0

            # Data query
            resp_d = await client.post(
                management_url, headers=mgmt_headers, json={"query": data_sql}
            )
            if resp_d.status_code >= 400:
                return [], 0
            items = resp_d.json()
            return items, total
    except Exception:
        return [], 0


async def _ilike_search(
    keyword: str, category: str | None, limit: int
) -> tuple[list[dict], int]:
    """ILIKE partial-match search via Supabase REST API (fallback)."""
    base_url = f"{SUPABASE_URL}/rest/v1/{TABLE}"

    # Build OR clause: ilike on name, description, category, sub_category
    like_pat = f"*{keyword}*"
    or_clause = (
        f"name.ilike.{like_pat},"
        f"description.ilike.{like_pat},"
        f"category.ilike.{like_pat},"
        f"sub_category.ilike.{like_pat}"
    )

    params: dict[str, str] = {
        "select": "*",
        "active": "eq.true",
        "or": or_clause,
        "limit": str(limit),
    }
    if category:
        params["category"] = f"eq.{category}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Count request
            count_headers = _sb_headers({"Prefer": "count=exact"})
            resp = await client.get(base_url, headers=count_headers, params=params)
            if resp.status_code != 200:
                return [], 0
            items = resp.json()
            # Parse content-range for exact count
            cr = resp.headers.get("content-range", "*/0")
            try:
                total = int(cr.split("/")[-1])
            except (ValueError, IndexError):
                total = len(items)
            return items, total
    except Exception:
        return [], 0


# ══════════════════════════════════════════════════════════════════════
# 2. GET /category  —  Browse items by category
# ══════════════════════════════════════════════════════════════════════

@router.get("/category")
async def catalog_category(
    name: str = Query(...),
    sub_category: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Return items in a given category, ordered by sort_order."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    base_url = f"{SUPABASE_URL}/rest/v1/{TABLE}"

    params: dict[str, str] = {
        "select": "*",
        "active": "eq.true",
        "category": f"eq.{name}",
        "order": "sort_order.asc.nullslast",
        "limit": str(limit),
        "offset": str(offset),
    }
    if sub_category:
        params["sub_category"] = f"eq.{sub_category}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            item_headers = _sb_headers({"Prefer": "count=exact"})
            resp = await client.get(base_url, headers=item_headers, params=params)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Supabase query failed: {resp.status_code} {resp.text[:300]}",
                )
            items = resp.json()

            cr = resp.headers.get("content-range", "*/0")
            try:
                total = int(cr.split("/")[-1])
            except (ValueError, IndexError):
                total = len(items)

        # Also fetch unique sub_categories for this category
        sub_cats = await _get_sub_categories(name)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Supabase request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Supabase request failed: {e}")

    return {
        "category": name,
        "items": items,
        "total": total,
        "sub_categories": sub_cats,
    }


async def _get_sub_categories(category: str) -> list[str]:
    """Fetch distinct sub_categories for a given category."""
    base_url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    params: dict[str, str] = {
        "select": "sub_category",
        "category": f"eq.{category}",
        "active": "eq.true",
        "sub_category": "not.is.null",
        "order": "sub_category.asc",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(base_url, headers=_sb_headers(), params=params)
            if resp.status_code == 200:
                rows = resp.json()
                seen: set[str] = set()
                result: list[str] = []
                for r in rows:
                    sc = (r.get("sub_category") or "").strip()
                    if sc and sc not in seen:
                        seen.add(sc)
                        result.append(sc)
                return result
    except Exception:
        pass
    return []


# ══════════════════════════════════════════════════════════════════════
# 3. GET /categories  —  All unique categories with counts
# ══════════════════════════════════════════════════════════════════════

@router.get("/categories")
async def catalog_categories():
    """Return all unique categories with item counts and sub_categories."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    # Fetch all distinct categories via REST — use GROUP BY via
    # Management API SQL endpoint (preferred) or client-side fallback.
    categories = await _get_category_aggregation()
    return {"categories": categories}


async def _get_category_aggregation() -> list[dict[str, Any]]:
    """
    Fetch category aggregation via Management API SQL (preferred) or
    fall back to fetching all active items and grouping client-side.
    """
    if _SUPABASE_ACCESS_TOKEN and PROJECT_REF:
        sql = (
            f"SELECT category, COUNT(*)::int AS count "
            f"FROM {TABLE} WHERE active = TRUE AND category IS NOT NULL "
            f"GROUP BY category ORDER BY category"
        )
        management_url = (
            f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
        )
        mgmt_headers = {
            "Authorization": f"Bearer {_SUPABASE_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    management_url, headers=mgmt_headers, json={"query": sql}
                )
                if resp.status_code == 200:
                    rows = resp.json()
                    # Build result with sub_categories per category
                    result: list[dict[str, Any]] = []
                    for row in rows:
                        cat_name = row.get("category", "")
                        sc = await _get_sub_categories(cat_name)
                        result.append({
                            "name": cat_name,
                            "count": row.get("count", 0),
                            "sub_categories": sc,
                        })
                    return result
        except Exception:
            pass

    # Fallback: fetch all active items and group client-side
    return await _get_category_aggregation_fallback()


async def _get_category_aggregation_fallback() -> list[dict[str, Any]]:
    """Client-side aggregation fallback using REST API."""
    base_url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    try:
        cat_count: dict[str, int] = {}
        sub_map: dict[str, set[str]] = {}
        offset = 0
        batch_size = 500

        while True:
            params: dict[str, str] = {
                "select": "category,sub_category",
                "active": "eq.true",
                "category": "not.is.null",
                "limit": str(batch_size),
                "offset": str(offset),
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(base_url, headers=_sb_headers(), params=params)
                if resp.status_code != 200:
                    break
                rows = resp.json()
                if not rows:
                    break
                for r in rows:
                    cat = r.get("category", "")
                    if not cat:
                        continue
                    cat_count[cat] = cat_count.get(cat, 0) + 1
                    sc = r.get("sub_category")
                    if sc:
                        sub_map.setdefault(cat, set()).add(sc)
                if len(rows) < batch_size:
                    break
                offset += batch_size

        result: list[dict[str, Any]] = []
        for cat in sorted(cat_count.keys()):
            result.append({
                "name": cat,
                "count": cat_count[cat],
                "sub_categories": sorted(sub_map.get(cat, set())),
            })
        return result
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════════
# 4. GET /featured  —  Random featured products
# ══════════════════════════════════════════════════════════════════════

@router.get("/featured")
async def catalog_featured():
    """Return 8 random active items as featured products."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    # PostgREST does not support ORDER BY RANDOM() via REST params.
    # Use Management API SQL if available, otherwise fetch and shuffle client-side.
    if _SUPABASE_ACCESS_TOKEN and PROJECT_REF:
        items = await _featured_via_sql()
        if items:
            return {"items": items}
        # Fall through to client-side shuffle

    # Client-side fallback: fetch a larger sample and shuffle
    items = await _featured_via_rest()
    return {"items": items}


async def _featured_via_sql() -> list[dict] | None:
    """Fetch 8 random items via Management API raw SQL."""
    sql = (
        f"SELECT * FROM {TABLE} "
        f"WHERE active = TRUE "
        f"ORDER BY RANDOM() LIMIT 8"
    )
    management_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    mgmt_headers = {
        "Authorization": f"Bearer {_SUPABASE_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                management_url, headers=mgmt_headers, json={"query": sql}
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


async def _featured_via_rest() -> list[dict]:
    """Fetch a larger batch via REST and shuffle client-side."""
    import random

    base_url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                base_url,
                headers=_sb_headers(),
                params={
                    "select": "*",
                    "active": "eq.true",
                    "limit": "50",
                },
            )
            if resp.status_code != 200:
                return []
            items = resp.json()
            random.shuffle(items)
            return items[:8]
    except Exception:
        return []
