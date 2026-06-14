"""
Local Database Helper — SQLite primary + Supabase fallback.

All data operations go through this module. Writes to SQLite first.
If SQLite fails (disk full, locked, etc.), falls back to Supabase.
Reads try SQLite first, then Supabase if not found.

Usage:
    from db import db
    items = db.query("cart_items", user_id="...")
    db.insert("cart_items", {"user_id": "...", "product_name": "..."})
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger("mybagasi.db")

# ── Config ──────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
_SUPABASE_AVAILABLE = bool(SUPABASE_URL and SUPABASE_KEY)

# Thread-local connections for safety
_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    """Get a thread-local SQLite connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA synchronous=NORMAL")
        _local.conn.execute("PRAGMA busy_timeout=5000")
    return _local.conn


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    # Parse JSON strings back to lists/dicts
    for key in ("images", "tags", "metadata", "items", "result", "value"):
        if isinstance(d.get(key), str):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


# ══════════════════════════════════════════════════════════════════
# Schema — auto-create tables on first use
# ══════════════════════════════════════════════════════════════════

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    role TEXT DEFAULT 'customer',
    tier TEXT DEFAULT 'Free',
    status TEXT DEFAULT 'active',
    points_balance INTEGER DEFAULT 0,
    avatar_url TEXT DEFAULT '',
    telegram_id TEXT DEFAULT '',
    telegram_token TEXT DEFAULT '',
    username TEXT DEFAULT '',
    bot_jwt TEXT DEFAULT '',
    bot_refresh_token TEXT DEFAULT '',
    memory TEXT DEFAULT '',
    last_active_at TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_token ON profiles(telegram_token);

CREATE TABLE IF NOT EXISTS pricing_config (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    price_jpy INTEGER DEFAULT 0,
    price_idr INTEGER DEFAULT 0,
    url TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    quantity INTEGER DEFAULT 1,
    source TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    category TEXT DEFAULT '',
    shipping_category TEXT DEFAULT '',
    catalog_item_id TEXT DEFAULT '',
    estimated_fee INTEGER DEFAULT 0,
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);

CREATE TABLE IF NOT EXISTS wishlist_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    emoji TEXT DEFAULT '🛍️',
    name TEXT DEFAULT '',
    url TEXT DEFAULT '',
    price_idr INTEGER DEFAULT 0,
    source TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);

CREATE TABLE IF NOT EXISTS price_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    target_price_idr INTEGER DEFAULT 0,
    current_price_idr INTEGER DEFAULT 0,
    url TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id);

CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product TEXT DEFAULT '',
    url TEXT DEFAULT '',
    source TEXT DEFAULT '',
    price_jpy INTEGER DEFAULT 0,
    exchange_rate REAL DEFAULT 0,
    service_fee INTEGER DEFAULT 0,
    shipping_cost INTEGER DEFAULT 0,
    tax_customs INTEGER DEFAULT 0,
    membership_discount INTEGER DEFAULT 0,
    points_used INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT '',
    expires_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_quotations_user ON quotations(user_id);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT '',
    telegram_id TEXT DEFAULT '',
    order_number TEXT DEFAULT '',
    order_type TEXT DEFAULT '',
    status TEXT DEFAULT 'dipesan',
    items TEXT DEFAULT '[]',
    total_idr INTEGER DEFAULT 0,
    invoice_url TEXT DEFAULT '',
    mayar_invoice_id TEXT DEFAULT '',
    tracking_number TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_orders_telegram ON orders(telegram_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    telegram_id TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    bill_number TEXT DEFAULT '',
    status TEXT DEFAULT 'unpaid',
    total_idr INTEGER DEFAULT 0,
    items TEXT DEFAULT '[]',
    invoice_url TEXT DEFAULT '',
    mayar_invoice_id TEXT DEFAULT '',
    mayar_order_id TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bills_telegram ON bills(telegram_id);

CREATE TABLE IF NOT EXISTS scrape_jobs (
    id TEXT PRIMARY KEY,
    url TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    job_type TEXT DEFAULT '',
    result TEXT DEFAULT '{}',
    error TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    completed_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS product_memory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_jp TEXT DEFAULT '',
    aliases TEXT DEFAULT '[]',
    price_jpy INTEGER DEFAULT 0,
    price_idr INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'JPY',
    marketplace TEXT DEFAULT '',
    url TEXT DEFAULT '',
    category TEXT DEFAULT '',
    sub_category TEXT DEFAULT '',
    shipping_category TEXT DEFAULT '',
    weight_kg REAL DEFAULT 0,
    images TEXT DEFAULT '[]',
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'scrape',
    confidence TEXT DEFAULT 'medium',
    search_count INTEGER DEFAULT 1,
    last_searched_at TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_url ON product_memory(url);
CREATE INDEX IF NOT EXISTS idx_memory_name ON product_memory(name);
"""

# ══════════════════════════════════════════════════════════════════
# Core Database Class
# ══════════════════════════════════════════════════════════════════

class Database:
    """Local SQLite database with Supabase fallback."""

    def __init__(self):
        self._init_schema()

    # ── Initialization ───────────────────────────────────────

    def _init_schema(self):
        """Create tables if they don't exist."""
        try:
            conn = _get_conn()
            conn.executescript(SCHEMA_SQL)
            conn.commit()
            log.info("SQLite app.db schema initialized")
        except Exception as e:
            log.error(f"Schema init error: {e}")

    # ── SQLite helpers ───────────────────────────────────────

    def _insert_sqlite(self, table: str, data: dict) -> bool:
        """Insert/Replace a row into SQLite. Returns True on success."""
        try:
            conn = _get_conn()
            # Only use columns that exist in the table
            cursor = conn.execute(f"PRAGMA table_info({table})")
            valid_cols = {row[1] for row in cursor.fetchall()}
            filtered = {k: v for k, v in data.items() if k in valid_cols}
            if not filtered:
                return False
            cols = ", ".join(filtered.keys())
            placeholders = ", ".join(["?"] * len(filtered))
            values = []
            for v in filtered.values():
                if isinstance(v, (list, dict)):
                    values.append(json.dumps(v))
                else:
                    values.append(v)
            conn.execute(
                f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({placeholders})",
                values,
            )
            conn.commit()
            return True
        except Exception as e:
            log.warning(f"SQLite insert {table} error: {e}")
            return False

    def _update_sqlite(self, table: str, data: dict, key_col: str, key_val: str) -> bool:
        """Update a row. Returns True on success."""
        try:
            conn = _get_conn()
            sets = ", ".join(f"{k} = ?" for k in data.keys() if k != key_col)
            values = []
            for k, v in data.items():
                if k == key_col:
                    continue
                if isinstance(v, (list, dict)):
                    values.append(json.dumps(v))
                else:
                    values.append(v)
            values.append(key_val)
            conn.execute(
                f"UPDATE {table} SET {sets} WHERE {key_col} = ?",
                values,
            )
            conn.commit()
            return True
        except Exception as e:
            log.warning(f"SQLite update {table} error: {e}")
            return False

    def _delete_sqlite(self, table: str, where: dict) -> bool:
        """Delete rows matching conditions."""
        try:
            conn = _get_conn()
            clauses = " AND ".join(f"{k} = ?" for k in where.keys())
            conn.execute(f"DELETE FROM {table} WHERE {clauses}", list(where.values()))
            conn.commit()
            return True
        except Exception as e:
            log.warning(f"SQLite delete {table} error: {e}")
            return False

    def _query_sqlite(self, table: str, where: dict | None = None,
                      order_by: str | None = None, limit: int = 100,
                      offset: int = 0, select: str = "*") -> list[dict]:
        """Query SQLite with optional filters."""
        try:
            conn = _get_conn()
            sql = f"SELECT {select} FROM {table}"
            params: list[Any] = []
            if where:
                clauses = " AND ".join(f"{k} = ?" for k in where.keys())
                sql += f" WHERE {clauses}"
                params = list(where.values())
            if order_by:
                sql += f" ORDER BY {order_by}"
            sql += f" LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            rows = conn.execute(sql, params).fetchall()
            return [_row_to_dict(r) for r in rows]
        except Exception as e:
            log.warning(f"SQLite query {table} error: {e}")
            return []

    # ── Supabase fallback ────────────────────────────────────

    def _is_supabase_ok(self) -> bool:
        return _SUPABASE_AVAILABLE

    async def _supabase_request(self, method: str, path: str,
                                json_body: dict | None = None,
                                params: dict | None = None) -> dict | list | None:
        """Make a Supabase REST API request."""
        if not self._is_supabase_ok():
            return None
        try:
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }
            url = f"{SUPABASE_URL}/rest/v1/{path.lstrip('/')}"
            async with httpx.AsyncClient(timeout=10) as client:
                if method == "GET":
                    r = await client.get(url, headers=headers, params=params)
                elif method == "POST":
                    r = await client.post(url, headers=headers, json=json_body, params=params)
                elif method == "PATCH":
                    r = await client.patch(url, headers=headers, json=json_body, params=params)
                elif method == "DELETE":
                    r = await client.delete(url, headers=headers, params=params)
                else:
                    return None
                if r.status_code in (200, 201):
                    return r.json()
                log.debug(f"Supabase {method} {path}: {r.status_code}")
                return None
        except Exception as e:
            log.debug(f"Supabase request error: {e}")
            return None

    # ── Public API ───────────────────────────────────────────

    def query(self, table: str, where: dict | None = None,
              order_by: str | None = None, limit: int = 100,
              offset: int = 0) -> list[dict]:
        """Query data. SQLite first, then Supabase fallback."""
        items = self._query_sqlite(table, where, order_by, limit, offset)
        if items:
            return items
        # Fallback to Supabase
        if self._is_supabase_ok():
            import asyncio
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            # Build query params
            params = {"limit": str(limit), "offset": str(offset)}
            if where:
                for k, v in where.items():
                    params[k] = f"eq.{v}"
            if order_by:
                params["order"] = order_by
            result = loop.run_until_complete(
                self._supabase_request("GET", table, params=params)
            )
            if isinstance(result, list):
                return result
        return []

    def get(self, table: str, where: dict) -> dict | None:
        """Get first matching row."""
        items = self.query(table, where, limit=1)
        return items[0] if items else None

    def insert(self, table: str, data: dict) -> bool:
        """Insert data. SQLite primary, then Supabase."""
        sqlite_ok = self._insert_sqlite(table, data)
        # Fire-and-forget Supabase (don't block on it)
        if self._is_supabase_ok():
            import asyncio
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    self._supabase_request("POST", table, json_body=data)
                )
            except Exception:
                pass
        return sqlite_ok

    def update(self, table: str, data: dict, key_col: str, key_val: str) -> bool:
        """Update row. SQLite primary, then Supabase."""
        sqlite_ok = self._update_sqlite(table, data, key_col, key_val)
        if self._is_supabase_ok():
            import asyncio
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    self._supabase_request("PATCH", table,
                                           json_body=data,
                                           params={key_col: f"eq.{key_val}"})
                )
            except Exception:
                pass
        return sqlite_ok

    def delete(self, table: str, where: dict) -> bool:
        """Delete rows. SQLite primary, then Supabase."""
        sqlite_ok = self._delete_sqlite(table, where)
        if self._is_supabase_ok():
            import asyncio
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    self._supabase_request("DELETE", table, params=where)
                )
            except Exception:
                pass
        return sqlite_ok

    def count(self, table: str, where: dict | None = None) -> int:
        """Count rows matching optional filter."""
        items = self.query(table, where, limit=10000)
        return len(items)

    def save_product_memory(self, product: dict) -> str:
        """Save a product to memory with auto-dedup.
        
        Dedup rules:
        1. Same URL → update existing, increment search_count
        2. Same name (token match) + same marketplace + price within 20% → merge aliases
        3. Completely new → insert
        
        Returns: product id (existing or new)
        """
        import uuid
        now = datetime.now(timezone.utc).isoformat()
        url = (product.get("url") or "").strip()
        name = (product.get("name") or "").strip()
        marketplace = (product.get("marketplace") or "").strip()
        price_jpy = product.get("price_jpy") or 0

        # ── Check by URL ──
        if url:
            existing = self.get("product_memory", {"url": url})
            if existing:
                eid = existing["id"]
                # Merge new data
                update_data = dict(product)
                update_data.pop("id", None)
                update_data.pop("created_at", None)
                update_data["search_count"] = (existing.get("search_count") or 0) + 1
                update_data["last_searched_at"] = now
                update_data["updated_at"] = now
                # Merge aliases
                existing_aliases = set()
                try:
                    existing_aliases = set(json.loads(existing.get("aliases") or "[]"))
                except Exception:
                    pass
                new_aliases = set()
                if name:
                    new_aliases.add(name.lower().strip())
                if product.get("name_jp"):
                    new_aliases.add(product["name_jp"].strip())
                merged = list(existing_aliases | new_aliases)
                update_data["aliases"] = json.dumps(merged)
                self._update_sqlite("product_memory", update_data, "id", eid)
                return eid

        # ── Check by name similarity ──
        if name and marketplace:
            # Tokenize the name into words
            name_tokens = set(name.lower().split())
            if len(name_tokens) >= 2:
                similar = self._query_sqlite("product_memory",
                    where={"marketplace": marketplace} if marketplace else None,
                    limit=50)
                for existing in similar:
                    ename = (existing.get("name") or "").lower()
                    etokens = set(ename.split())
                    # Check overlap ratio
                    if name_tokens and etokens:
                        overlap = len(name_tokens & etokens)
                        min_len = min(len(name_tokens), len(etokens))
                        if min_len > 0 and overlap / min_len >= 0.6:
                            # Also check price is within 20%
                            eprice = existing.get("price_jpy") or 0
                            if eprice > 0 and price_jpy > 0:
                                ratio = max(eprice, price_jpy) / min(eprice, price_jpy)
                                if ratio > 1.2:
                                    continue  # Price too different, not same product
                            # Match found — update
                            eid = existing["id"]
                            update_data = dict(product)
                            update_data.pop("id", None)
                            update_data.pop("created_at", None)
                            update_data["search_count"] = (existing.get("search_count") or 0) + 1
                            update_data["last_searched_at"] = now
                            update_data["updated_at"] = now
                            # Merge aliases
                            existing_aliases = set()
                            try:
                                existing_aliases = set(json.loads(existing.get("aliases") or "[]"))
                            except Exception:
                                pass
                            existing_aliases.add(name.lower().strip())
                            if product.get("name_jp"):
                                existing_aliases.add(product["name_jp"].strip())
                            # Also add existing name as alias for the new name
                            if ename and ename.lower() != name.lower():
                                existing_aliases.add(ename.lower())
                            update_data["aliases"] = json.dumps(list(existing_aliases))
                            self._update_sqlite("product_memory", update_data, "id", eid)
                            return eid

        # ── Insert new ──
        pid = product.get("id") or str(uuid.uuid4())
        insert_data = dict(product)
        insert_data["id"] = pid
        insert_data["created_at"] = insert_data.get("created_at") or now
        insert_data["updated_at"] = now
        insert_data["search_count"] = insert_data.get("search_count") or 1
        insert_data["last_searched_at"] = now
        # Build aliases
        aliases = set()
        if name:
            aliases.add(name.lower().strip())
        if product.get("name_jp"):
            aliases.add(product["name_jp"].strip())
        if aliases:
            insert_data["aliases"] = json.dumps(list(aliases))
        self._insert_sqlite("product_memory", insert_data)
        return pid

    def all(self, table: str, order_by: str | None = None) -> list[dict]:
        """Get all rows from a table."""
        return self.query(table, order_by=order_by, limit=10000)

    def sync_from_supabase(self, table: str, limit: int = 1000) -> int:
        """Pull all data from Supabase into SQLite. Returns count inserted."""
        if not self._is_supabase_ok():
            return 0
        import asyncio
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        result = loop.run_until_complete(
            self._supabase_request("GET", table, params={"limit": str(limit)})
        )
        if not isinstance(result, list):
            return 0
        count = 0
        for item in result:
            if self._insert_sqlite(table, item):
                count += 1
        log.info(f"Synced {count}/{len(result)} rows from Supabase.{table}")
        return count


# Singleton
db = Database()
