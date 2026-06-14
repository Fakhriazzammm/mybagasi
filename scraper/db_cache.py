"""
SQLite persistence for per-user conversation and browser session data.

Database file: /opt/mybagasi/scraper/bot_cache.db
Tables:
  - conversations  (chat_id, messages JSON, context JSON, user_id, updated_at)
  - browser_sessions (chat_id, current_url, page_data JSON, created_at, last_active)

All functions use synchronous sqlite3 with thread-safe locking. Intended for use
in an asyncio bot where these small SQLite ops are run via a thread executor or
called synchronously from non-asyncio code.
"""

import json
import logging
import sqlite3
import threading
import time

log = logging.getLogger("mybagasi_db")

DB_PATH = "/opt/mybagasi/scraper/bot_cache.db"

_lock = threading.Lock()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _conn() -> sqlite3.Connection:
    """Open (or reuse) a connection.  Each call gets a fresh connection so we
    don't share across threads — the lock serialises access anyway."""
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA synchronous=NORMAL")
    return c


# ---------------------------------------------------------------------------
# schema
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create tables if they don't already exist."""
    with _lock:
        db = None
        try:
            db = _conn()
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    chat_id   INTEGER PRIMARY KEY,
                    messages  TEXT    NOT NULL DEFAULT '[]',
                    context   TEXT    NOT NULL DEFAULT '{}',
                    user_id   TEXT,
                    updated_at REAL   NOT NULL
                );

                CREATE TABLE IF NOT EXISTS browser_sessions (
                    chat_id     INTEGER PRIMARY KEY,
                    current_url TEXT,
                    page_data   TEXT    NOT NULL DEFAULT '{}',
                    created_at  REAL    NOT NULL,
                    last_active REAL    NOT NULL
                );
                """
            )
            db.commit()
            log.info("Database initialised at %s", DB_PATH)
        except Exception:
            log.exception("Failed to initialise database")
            raise
        finally:
            if db is not None:
                db.close()


# ---------------------------------------------------------------------------
# conversations
# ---------------------------------------------------------------------------

def load_conversation(chat_id: int) -> dict | None:
    """Load a saved conversation.

    Returns ``{"messages": [...], "context": {...}}`` or *None* when no
    conversation exists for *chat_id*.
    """
    with _lock:
        db = None
        try:
            db = _conn()
            row = db.execute(
                "SELECT messages, context FROM conversations WHERE chat_id = ?",
                (chat_id,),
            ).fetchone()
            if row is None:
                return None
            return {
                "messages": json.loads(row["messages"]),
                "context": json.loads(row["context"]),
            }
        except Exception:
            log.exception("Error loading conversation for chat_id=%s", chat_id)
            return None
        finally:
            if db is not None:
                db.close()


def save_conversation(
    chat_id: int,
    messages: list,
    context: dict,
    user_id: str | None = None,
) -> None:
    """Insert or replace a conversation row."""
    with _lock:
        db = None
        try:
            db = _conn()
            db.execute(
                """INSERT OR REPLACE INTO conversations
                   (chat_id, messages, context, user_id, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    chat_id,
                    json.dumps(messages, ensure_ascii=False),
                    json.dumps(context, ensure_ascii=False),
                    user_id,
                    time.time(),
                ),
            )
            db.commit()
        except Exception:
            log.exception("Error saving conversation for chat_id=%s", chat_id)
            raise
        finally:
            if db is not None:
                db.close()


def delete_conversation(chat_id: int) -> None:
    """Delete a single conversation row."""
    with _lock:
        db = None
        try:
            db = _conn()
            db.execute("DELETE FROM conversations WHERE chat_id = ?", (chat_id,))
            db.commit()
        except Exception:
            log.exception("Error deleting conversation for chat_id=%s", chat_id)
            raise
        finally:
            if db is not None:
                db.close()


def get_all_conversation_ids() -> list[int]:
    """Return all conversation chat IDs (used to reload state on startup)."""
    with _lock:
        db = None
        try:
            db = _conn()
            rows = db.execute("SELECT chat_id FROM conversations").fetchall()
            return [r["chat_id"] for r in rows]
        except Exception:
            log.exception("Error fetching all conversation IDs")
            return []
        finally:
            if db is not None:
                db.close()


def cleanup_old(ttl_days: int = 7) -> int:
    """Delete conversations whose ``updated_at`` is older than *ttl_days*.

    Returns the number of deleted rows.
    """
    cutoff = time.time() - (ttl_days * 86_400)
    with _lock:
        db = None
        try:
            db = _conn()
            cursor = db.execute(
                "DELETE FROM conversations WHERE updated_at < ?", (cutoff,)
            )
            db.commit()
            deleted = cursor.rowcount
            if deleted:
                log.info("Cleaned up %d old conversation(s)", deleted)
            return deleted
        except Exception:
            log.exception("Error during cleanup of old conversations")
            return 0
        finally:
            if db is not None:
                db.close()


# ---------------------------------------------------------------------------
# browser sessions
# ---------------------------------------------------------------------------

def load_browser_session(chat_id: int) -> dict | None:
    """Load a saved browser session.

    Returns a dict like::

        {
            "chat_id": ...,
            "current_url": ...,
            "page_data": {...},
            "created_at": ...,
            "last_active": ...,
        }

    or *None* when no session exists.
    """
    with _lock:
        db = None
        try:
            db = _conn()
            row = db.execute(
                "SELECT * FROM browser_sessions WHERE chat_id = ?",
                (chat_id,),
            ).fetchone()
            if row is None:
                return None
            return {
                "chat_id": row["chat_id"],
                "current_url": row["current_url"],
                "page_data": json.loads(row["page_data"]),
                "created_at": row["created_at"],
                "last_active": row["last_active"],
            }
        except Exception:
            log.exception("Error loading browser session for chat_id=%s", chat_id)
            return None
        finally:
            if db is not None:
                db.close()


def save_browser_session(chat_id: int, data: dict) -> None:
    """Insert or replace a browser session row.

    Expected keys in *data*: ``current_url``, ``page_data`` (dict),
    ``created_at``, ``last_active``.  ``created_at`` and ``last_active``
    default to ``time.time()`` when omitted.
    """
    now = time.time()
    with _lock:
        db = None
        try:
            db = _conn()
            db.execute(
                """INSERT OR REPLACE INTO browser_sessions
                   (chat_id, current_url, page_data, created_at, last_active)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    chat_id,
                    data.get("current_url"),
                    json.dumps(data.get("page_data", {}), ensure_ascii=False),
                    data.get("created_at", now),
                    data.get("last_active", now),
                ),
            )
            db.commit()
        except Exception:
            log.exception("Error saving browser session for chat_id=%s", chat_id)
            raise
        finally:
            if db is not None:
                db.close()


def delete_browser_session(chat_id: int) -> None:
    """Delete a single browser session row."""
    with _lock:
        db = None
        try:
            db = _conn()
            db.execute(
                "DELETE FROM browser_sessions WHERE chat_id = ?", (chat_id,)
            )
            db.commit()
        except Exception:
            log.exception("Error deleting browser session for chat_id=%s", chat_id)
            raise
        finally:
            if db is not None:
                db.close()
