"""
Catalog search & discovery routes for MyBagasi.
Exposes search, category browsing, category listing, and featured products
from the local SQLite `catalog.db` file (no Supabase dependency).
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from typing import Any

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/catalog")

# ── SQLite config ──────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "catalog.db")

def _get_db() -> sqlite3.Connection:
    """Get a read-only SQLite connection (1 connection per request)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")
    return conn


def _row_to_dict(row: sqlite3.Row) -> dict:
    """Convert SQLite row to dict with parsed JSON fields."""
    d = dict(row)
    # Parse JSON string fields back to lists/dicts
    for key in ("images", "tags", "metadata"):
        if isinstance(d.get(key), str):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                d[key] = [] if key in ("images", "tags") else {}
    return d


# ══════════════════════════════════════════════════════════════════════
# 1. GET /search  —  Full-text search with ILIKE fallback
# ══════════════════════════════════════════════════════════════════════

@router.get("/search")
async def catalog_search(
    keyword: str = Query(...),
    category: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Search catalog using FTS5 full-text search, with ILIKE fallback."""
    keyword = keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    conn = _get_db()
    try:
        # ── Attempt 1: FTS5 full-text search ──
        items = _fts_search(conn, keyword, category, limit)
        if items:
            return {"items": items, "total": len(items)}

        # ── Attempt 2: ILIKE fallback ──
        items = _ilike_search(conn, keyword, category, limit)
        return {"items": items, "total": len(items)}
    finally:
        conn.close()


def _fts_search(conn: sqlite3.Connection, keyword: str, category: str | None, limit: int) -> list[dict]:
    """FTS5 full-text search via catalog_fts virtual table."""
    try:
        # Sanitize: only allow alphanumeric and spaces for FTS5
        safe_kw = re.sub(r'[^\w\s]', ' ', keyword).strip()
        if not safe_kw:
            return []

        # Build FTS5 query — use prefix matching for partial words
        terms = safe_kw.split()
        fts_query = ' OR '.join(f'"{t}"' for t in terms)

        sql = """
            SELECT c.* FROM catalog_items c
            JOIN catalog_fts f ON c.rowid = f.rowid
            WHERE catalog_fts MATCH ? AND c.active = 1
        """
        params: list[Any] = [fts_query]

        if category:
            sql += " AND c.category = ?"
            params.append(category)

        sql += " ORDER BY c.sort_order ASC, c.price_jpy ASC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]
    except Exception:
        return []


def _ilike_search(conn: sqlite3.Connection, keyword: str, category: str | None, limit: int) -> list[dict]:
    """ILIKE fallback — partial matching on name and description."""
    like_pat = f"%{keyword}%"

    sql = """
        SELECT * FROM catalog_items
        WHERE active = 1
        AND (name LIKE ? OR description LIKE ?)
    """
    params: list[Any] = [like_pat, like_pat]

    if category:
        sql += " AND category = ?"
        params.append(category)

    sql += " ORDER BY sort_order ASC, price_jpy ASC LIMIT ?"
    params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════════════
# 2. GET /categories  —  List all categories with count
# ══════════════════════════════════════════════════════════════════════

@router.get("/categories")
async def catalog_categories():
    """List all product categories with counts and sample image."""
    conn = _get_db()
    try:
        rows = conn.execute("""
            SELECT
                category,
                COUNT(*) as count,
                MIN(price_jpy) as min_price,
                MAX(price_jpy) as max_price,
                (SELECT json_extract(images, '$[0]') FROM catalog_items c2
                 WHERE c2.category = c.category AND c2.active = 1 AND c2.images != '[]'
                 LIMIT 1) as sample_image
            FROM catalog_items c
            WHERE active = 1
            GROUP BY category
            ORDER BY COUNT(*) DESC
        """).fetchall()

        categories = []
        for row in rows:
            d = dict(row)
            categories.append({
                "name": d["category"],
                "count": d["count"],
                "min_price": d["min_price"],
                "max_price": d["max_price"],
                "sample_image": d["sample_image"] if d["sample_image"] else "",
            })

        return {"categories": categories}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════
# 3. GET /category  —  Products in a category
# ══════════════════════════════════════════════════════════════════════

@router.get("/category")
async def catalog_category(
    name: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get products in a specific category."""
    conn = _get_db()
    try:
        # Total count
        count_row = conn.execute(
            "SELECT COUNT(*) FROM catalog_items WHERE active = 1 AND category = ?",
            (name,),
        ).fetchone()
        total = count_row[0]

        # Items
        rows = conn.execute(
            "SELECT * FROM catalog_items WHERE active = 1 AND category = ? "
            "ORDER BY sort_order ASC, price_jpy ASC LIMIT ? OFFSET ?",
            (name, limit, offset),
        ).fetchall()

        items = [_row_to_dict(r) for r in rows]
        return {"items": items, "total": total, "category": name}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════
# 4. GET /featured  —  Featured products (pick 1 per category)
# ══════════════════════════════════════════════════════════════════════

@router.get("/featured")
async def catalog_featured(limit: int = Query(12, ge=1, le=50)):
    """Get featured products — one per category, sorted by sort_order."""
    conn = _get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY category ORDER BY sort_order ASC, price_jpy ASC
                ) as rn
                FROM catalog_items WHERE active = 1
            ) WHERE rn = 1
            ORDER BY sort_order ASC, price_jpy ASC
            LIMIT ?
        """, (limit,)).fetchall()

        items = [_row_to_dict(r) for r in rows]
        return {"items": items, "total": len(items)}
    finally:
        conn.close()
