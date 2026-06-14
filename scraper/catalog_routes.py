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

from db import auto_categorize
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/catalog")

# ── SQLite config ──────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "catalog.db")

def _get_db() -> sqlite3.Connection:
    """Get a read-only SQLite connection (1 connection per request)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")
    # Ensure memory table exists (created by db.py normally, but safe to ensure here)
    try:
        conn.execute("SELECT 1 FROM product_memory LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("PRAGMA query_only = 0")
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS product_memory (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, name_jp TEXT DEFAULT '',
                aliases TEXT DEFAULT '[]', price_jpy INTEGER DEFAULT 0,
                price_idr INTEGER DEFAULT 0, currency TEXT DEFAULT 'JPY',
                marketplace TEXT DEFAULT '', url TEXT DEFAULT '',
                category TEXT DEFAULT '', sub_category TEXT DEFAULT '',
                shipping_category TEXT DEFAULT '', weight_kg REAL DEFAULT 0,
                images TEXT DEFAULT '[]', description TEXT DEFAULT '',
                tags TEXT DEFAULT '[]', source TEXT DEFAULT 'scrape',
                confidence TEXT DEFAULT 'medium', search_count INTEGER DEFAULT 1,
                last_searched_at TEXT DEFAULT '', created_at TEXT DEFAULT '',
                updated_at TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_url ON product_memory(url);
            CREATE INDEX IF NOT EXISTS idx_memory_name ON product_memory(name);
        """)
        conn.execute("PRAGMA query_only = 1")
        conn.commit()
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
            return {"items": items, "source": "catalog", "total": len(items)}

        # ── Attempt 2: ILIKE fallback ──
        items = _ilike_search(conn, keyword, category, limit)
        if items:
            return {"items": items, "source": "catalog", "total": len(items)}

        # ── Attempt 3: product_memory search ──
        memory_items = _memory_search(conn, keyword, category, limit)
        return {"items": memory_items, "source": "memory", "total": len(memory_items)}
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


def _memory_search(conn: sqlite3.Connection, keyword: str, category: str | None, limit: int) -> list[dict]:
    """Search product_memory table (auto-collected from user searches)."""
    try:
        like_pat = f"%{keyword}%"
        sql = "SELECT * FROM product_memory WHERE 1=1"
        params: list[Any] = [like_pat, like_pat, like_pat, like_pat]

        if category:
            sql += " AND category = ?"
            params.append(category)

        sql += " AND (name LIKE ? OR name_jp LIKE ? OR description LIKE ? OR aliases LIKE ?)"
        sql += " ORDER BY search_count DESC, price_jpy ASC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]
    except Exception:
        return []


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


# ══════════════════════════════════════════════════════════════════════
# 5. GET /memory  —  Community product memory (auto-collected)
# ══════════════════════════════════════════════════════════════════════

@router.get("/memory")
async def catalog_memory(
    search: str | None = Query(None),
    category: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort: str = Query("search_count", regex="^(search_count|price_jpy|name|last_searched_at)$"),
):
    """Get products from community memory. Search by keyword or category."""
    from db import db
    from datetime import datetime, timezone
    import json

    conn = _get_db()
    try:
        # Build query
        sql = "SELECT * FROM product_memory WHERE 1=1"
        count_sql = "SELECT COUNT(*) FROM product_memory WHERE 1=1"
        params: list[Any] = []
        count_params: list[Any] = []

        if search:
            like = f"%{search}%"
            sql += " AND (name LIKE ? OR name_jp LIKE ? OR description LIKE ? OR aliases LIKE ?)"
            count_sql += " AND (name LIKE ? OR name_jp LIKE ? OR description LIKE ? OR aliases LIKE ?)"
            params.extend([like, like, like, like])
            count_params.extend([like, like, like, like])

        if category:
            sql += " AND category = ?"
            count_sql += " AND category = ?"
            params.append(category)
            count_params.append(category)

        # Order
        order_map = {
            "search_count": "search_count DESC",
            "price_jpy": "price_jpy ASC",
            "name": "name ASC",
            "last_searched_at": "last_searched_at DESC",
        }
        sql += f" ORDER BY {order_map.get(sort, 'search_count DESC')}"

        # Count
        total = conn.execute(count_sql, count_params).fetchone()[0]

        # Items
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        rows = conn.execute(sql, params).fetchall()

        items = [_row_to_dict(r) for r in rows]
        return {"items": items, "total": total}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════
# 6. POST & GET /auto-categorize  —  Auto-determine category
# ══════════════════════════════════════════════════════════════════════

@router.post("/auto-categorize")
async def catalog_auto_categorize(data: dict):
    """Auto-determine category for a product name/description."""
    name = data.get("name", "")
    description = data.get("description", "")
    keywords = data.get("keywords", "")
    category = auto_categorize(name, description, keywords)
    return {"category": category}


@router.get("/auto-categorize")
async def catalog_auto_categorize_get(
    name: str = Query(...),
    description: str = Query(""),
    keywords: str = Query(""),
):
    """Auto-determine category for a product (GET version)."""
    category = auto_categorize(name, description, keywords)
    return {"category": category}
