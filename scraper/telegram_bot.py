"""
MyBagasi Telegram Bot
=====================
Long-polling bot that links Telegram users to MyBagasi accounts
via unique per-user tokens.

Commands:
  /start <TOKEN>  — Link Telegram akun ke MyBagasi
  /status         — Cek status akun MyBagasi
  /help           — Bantuan
"""

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

import httpx

# ── Configuration ──────────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
POLL_TIMEOUT = 30  # long-poll seconds
POLL_INTERVAL = 2  # seconds between polls when no updates

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mybagasi_bot")

# ── Helpers ────────────────────────────────────────────────


def tg_url(method: str) -> str:
    return f"{TELEGRAM_API}/{method}"


async def tg_send(chat_id: int, text: str, parse_mode: str = "Markdown") -> dict | None:
    """Send a message via Telegram Bot API."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                tg_url("sendMessage"),
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                },
            )
            return r.json()
    except Exception as e:
        log.error(f"tg_send error: {e}")
        return None


async def supabase_query(sql: str) -> tuple[list | None, str | None]:
    """Execute raw SQL via Supabase REST API (service_role)."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "params=single-object",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/pgrest_execute",
                json={"query": sql},
                headers=headers,
            )
            if r.status_code == 200:
                return r.json(), None
            # Fallback: use direct REST
            return None, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return None, str(e)


async def lookup_user_by_token(token: str) -> dict | None:
    """Find user profile by telegram_token."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "telegram_token": f"eq.{token}",
                    "select": "id,name,email,telegram_id,telegram_token",
                    "limit": 1,
                },
                headers=headers,
            )
            if r.status_code == 200 and r.json():
                return r.json()[0]
            return None
    except Exception as e:
        log.error(f"lookup_user error: {e}")
        return None


async def link_telegram(user_id: str, telegram_chat_id: int) -> bool:
    """Save telegram_id to user profile."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"id": f"eq.{user_id}"},
                json={"telegram_id": telegram_chat_id},
                headers=headers,
            )
            return r.status_code in (200, 204)
    except Exception as e:
        log.error(f"link_telegram error: {e}")
        return False


async def unlink_telegram(telegram_chat_id: int) -> bool:
    """Remove telegram_id from profile (unlink)."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_chat_id}"},
                json={"telegram_id": None},
                headers=headers,
            )
            return r.status_code in (200, 204)
    except Exception as e:
        log.error(f"unlink_telegram error: {e}")
        return False


async def lookup_user_by_telegram_id(telegram_chat_id: int) -> dict | None:
    """Find user profile by telegram_id."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "telegram_id": f"eq.{telegram_chat_id}",
                    "select": "id,name,email,telegram_id,telegram_token",
                    "limit": 1,
                },
                headers=headers,
            )
            if r.status_code == 200 and r.json():
                return r.json()[0]
            return None
    except Exception as e:
        log.error(f"lookup_user_by_telegram_id error: {e}")
        return None


# ── Command Handlers ───────────────────────────────────────


async def handle_start(chat_id: int, args: str, message_id: int):
    """Handle /start <TOKEN> — link Telegram to MyBagasi."""
    token = args.strip().upper()

    if not token:
        await tg_send(
            chat_id,
            "👋 *Selamat datang di MyBagasi Bot!*\n\n"
            "Untuk menghubungkan akun MyBagasi kamu, silakan gunakan:\n"
            "`/start KODE_RAHASIA_KAMU`\n\n"
            "Kode rahasia bisa kamu lihat di halaman *Profile* aplikasi MyBagasi.\n"
            "Belum punya akun? Daftar di https://mybagasi.my.id/auth/register",
        )
        return

    # Cek apakah chat_id sudah terlink
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(
            chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Email: `{existing['email']}`\n\n"
            "Kalau mau ganti akun, gunakan `/unlink` dulu.",
        )
        return

    # Cari user by token
    user = await lookup_user_by_token(token)
    if not user:
        await tg_send(
            chat_id,
            "❌ Kode tidak valid. Pastikan kamu memasukkan kode yang benar\n"
            "dari halaman Profile di aplikasi MyBagasi.\n\n"
            "Kode bersifat *rahasia* — jangan bagikan ke orang lain!",
        )
        return

    # Cek apakah token sudah terlink ke Telegram lain
    if user.get("telegram_id") and user["telegram_id"] != chat_id:
        await tg_send(
            chat_id,
            "❌ Kode ini sudah terhubung ke akun Telegram lain.\n"
            "Hubungi support jika kamu merasa ini salah.",
        )
        return

    # Link
    success = await link_telegram(user["id"], chat_id)
    if success:
        await tg_send(
            chat_id,
            f"✅ *Berhasil terhubung!*\n\n"
            f"Halo *{user['name']}*, akun Telegram kamu sekarang\n"
            f"terhubung ke MyBagasi.\n\n"
            f"Email: `{user['email']}`\n"
            f"Kode: `{token}`\n\n"
            "Gunakan `/status` untuk cek informasi akun.\n"
            "Gunakan `/unlink` untuk putuskan sambungan.",
        )
        log.info(f"User {user['name']} ({user['id']}) linked via token {token}")
    else:
        await tg_send(
            chat_id,
            "❌ Gagal menghubungkan. Silakan coba lagi nanti.",
        )


async def handle_status(chat_id: int):
    """Handle /status — show linked account info."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(
            chat_id,
            "🔍 Akun Telegram ini *belum terhubung* ke MyBagasi.\n\n"
            "Gunakan `/start KODE_RAHASIA_KAMU` untuk menghubungkan.\n"
            "Kode bisa dilihat di halaman Profile aplikasi MyBagasi.",
        )
        return

    await tg_send(
        chat_id,
        f"✅ *Terhubung ke MyBagasi*\n\n"
        f"Nama: *{user['name']}*\n"
        f"Email: `{user['email']}`\n"
        f"Kode: `{user['telegram_token']}`\n\n"
        "Gunakan `/unlink` untuk memutus sambungan.",
    )


async def handle_unlink(chat_id: int):
    """Handle /unlink — remove Telegram link."""
    user = await lookup_user_by_telegram_id(chat_id)
    if not user:
        await tg_send(
            chat_id,
            "⚠️ Akun Telegram ini tidak terhubung ke akun MyBagasi manapun.",
        )
        return

    success = await unlink_telegram(chat_id)
    if success:
        await tg_send(
            chat_id,
            f"🔌 *Sambungan diputus.*\n\n"
            f"Akun *{user['name']}* sudah tidak terhubung ke Telegram ini.\n"
            f"Kode `{user['telegram_token']}` bisa digunakan lagi kapan saja.",
        )
        log.info(f"User {user['name']} ({user['id']}) unlinked")
    else:
        await tg_send(
            chat_id,
            "❌ Gagal memutus sambungan. Silakan coba lagi.",
        )


async def handle_help(chat_id: int):
    """Handle /help."""
    await tg_send(
        chat_id,
        "📖 *Bantuan MyBagasi Bot*\n\n"
        "`/start KODE` — Hubungkan akun MyBagasi\n"
        "`/status` — Cek status koneksi akun\n"
        "`/unlink` — Putuskan sambungan akun\n"
        "`/help` — Tampilkan bantuan ini\n\n"
        "Kode unik kamu ada di halaman *Profile* aplikasi MyBagasi.\n"
        "Jangan bagikan kode ke siapapun!",
    )


async def handle_unknown(chat_id: int, text: str):
    """Handle unknown commands."""
    await tg_send(
        chat_id,
        "❓ Perintah tidak dikenal. Gunakan `/help` untuk bantuan.",
    )


# ── Message Router ─────────────────────────────────────────


async def process_update(update: dict):
    """Process a single Telegram update."""
    message = update.get("message")
    if not message:
        return

    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    message_id = message["message_id"]

    if not text:
        return

    # Parse command
    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    # Remove bot username from command: /start@mybagasi_bot
    if "@" in command:
        command = command.split("@")[0]

    log.info(f"← {chat_id}: /{command} {args[:20]}")

    if command == "/start":
        await handle_start(chat_id, args, message_id)
    elif command == "/status":
        await handle_status(chat_id)
    elif command == "/unlink":
        await handle_unlink(chat_id)
    elif command == "/help":
        await handle_help(chat_id)
    else:
        await handle_unknown(chat_id, text)


# ── Polling Loop ───────────────────────────────────────────


async def poll_forever():
    """Long-poll Telegram for updates."""
    if not BOT_TOKEN:
        log.error("TELEGRAM_BOT_TOKEN tidak diatur. Set di .env")
        return

    log.info(f"Bot starting... token: {BOT_TOKEN[:8]}...")

    offset = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=POLL_TIMEOUT + 10) as client:
                r = await client.get(
                    tg_url("getUpdates"),
                    params={
                        "offset": offset,
                        "timeout": POLL_TIMEOUT,
                        "allowed_updates": json.dumps(["message"]),
                    },
                )
                data = r.json()

                if data.get("ok") and data.get("result"):
                    for update in data["result"]:
                        await process_update(update)
                        offset = update["update_id"] + 1

        except asyncio.CancelledError:
            log.info("Bot polling cancelled")
            break
        except httpx.TimeoutException:
            # Long-poll timeout is normal — keep going
            continue
        except Exception as e:
            log.error(f"Poll error: {e}")
            await asyncio.sleep(POLL_INTERVAL)


# ── Entry Point ────────────────────────────────────────────


async def main():
    log.info("=" * 40)
    log.info("MyBagasi Telegram Bot starting...")
    log.info("=" * 40)

    # Verify Supabase connection
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL dan SUPABASE_KEY wajib diatur di .env")
        sys.exit(1)

    # Quick Supabase health check
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"select": "count", "limit": 1},
                headers=headers,
            )
            if r.status_code == 200:
                log.info("Supabase connection OK")
            else:
                log.warning(f"Supabase check: HTTP {r.status_code}")
    except Exception as e:
        log.warning(f"Supabase check failed: {e}")

    await poll_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot stopped by user")
