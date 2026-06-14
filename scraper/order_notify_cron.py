#!/usr/bin/env python3
"""MyBagasi cron: check recent order updates & notify users via Telegram."""
import json, re, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

# ─── Parse .env ─────────────────────────────────────────────
def parse_env(path):
    env = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                continue
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip().strip('\'"')
    return env

env = parse_env('/opt/mybagasi/scraper/.env')
SUPABASE_URL = env.get('SUPABASE_URL', '')
SERVICE_KEY  = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
BOT_TOKEN    = env.get('TELEGRAM_BOT_TOKEN', '')

if not SUPABASE_URL or not SERVICE_KEY or not BOT_TOKEN:
    print("ERROR: missing env vars")
    exit(1)

# ─── Status mappings ────────────────────────────────────────
STATUS_EMOJI = {
    "draft": "\U0001f4dd", "quote_created": "\U0001f4b0",
    "waiting_payment": "\u23f3", "paid": "\u2705",
    "procurement_queue": "\u23f3", "purchased": "\U0001f6cd",
    "in_japan_warehouse": "\U0001f3ed", "packed": "\U0001f4e6",
    "shipped_to_indonesia": "\U0001f6a2", "customs_clearance": "\U0001f3db",
    "last_mile_delivery": "\U0001f69a", "delivered": "\u2705",
    "cancelled": "\u274c", "refunded": "\U0001f4b3",
}
STATUS_LABEL = {
    "draft": "Draft", "quote_created": "Penawaran Dibuat",
    "waiting_payment": "Menunggu Pembayaran", "paid": "Dibayar",
    "procurement_queue": "Procurement", "purchased": "Dibeli di Jepang",
    "in_japan_warehouse": "Di Gudang Jepang", "packed": "Dikemas",
    "shipped_to_indonesia": "Dalam Perjalanan",
    "customs_clearance": "Bea Cukai",
    "last_mile_delivery": "Kurir Lokal",
    "delivered": "Sampai \u2705",
    "cancelled": "Dibatalkan", "refunded": "Dikembalikan",
}

# ─── Query Supabase REST API ────────────────────────────────
cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).strftime('%Y-%m-%dT%H:%M:%SZ')
url = f"{SUPABASE_URL}/rest/v1/recent_order_updates?updated_at=gt.{cutoff}&select=*"
req = urllib.request.Request(url, headers={
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Accept": "application/json",
})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        rows = json.loads(resp.read().decode())
except urllib.error.HTTPError as e:
    body = e.read().decode(errors='replace')
    print(f"HTTP {e.code}: {body[:200]}")
    exit(0)
except Exception as e:
    print(f"Query error: {e}")
    exit(0)

if not rows:
    print(f"[{datetime.now(timezone.utc).isoformat()}] No order updates found in last 10 min.")
    exit(0)

print(f"[{datetime.now(timezone.utc).isoformat()}] Found {len(rows)} order update(s):")

# ─── Send Telegram notifications ────────────────────────────
tg_api = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
sent = 0
failed = 0

for row in rows:
    telegram_id = row.get("telegram_id")
    product     = row.get("product", "Pesanan")
    status      = row.get("status", "")
    tracking    = row.get("tracking_info") or ""
    updated_at  = row.get("updated_at", "")

    emoji = STATUS_EMOJI.get(status, "\u2753")
    label = STATUS_LABEL.get(status, status)

    # Build message
    parts = ["\U0001f4e6 *Update Pesanan*", ""]
    parts.append(f"*{product}*")
    parts.append(f"Status: {emoji} {label}")
    if tracking:
        parts.append(tracking)
    parts.append("")
    parts.append("Ketik /order untuk detail lengkap.")
    msg_text = "\n".join(parts)

    payload = json.dumps({
        "chat_id": telegram_id,
        "text": msg_text,
        "parse_mode": "Markdown",
    }).encode()

    tg_req = urllib.request.Request(tg_api, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(tg_req, timeout=10) as tg_resp:
            result = json.loads(tg_resp.read().decode())
        if result.get("ok"):
            sent += 1
            print(f"  OK  -> tg_id={telegram_id} | {status} | {product[:40]}")
        else:
            failed += 1
            print(f"  FAIL -> tg_id={telegram_id} | {result.get('description','')}")
    except Exception as e:
        failed += 1
        print(f"  ERROR -> tg_id={telegram_id} | {e}")

print(f"\nDone: {sent} sent, {failed} failed")
