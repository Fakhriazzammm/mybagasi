# MyBagasi Bot — Fitur Expansion Plan

> **Untuk Hermes:** Implementasi task-by-task via profile `mybagasi-ai`. Baca SOUL.md + AGENTS.md + memory sebelum mulai.

**Goal:** Transform MyBagasi Telegram bot dari bot AI search-only menjadi bot e-commerce lengkap — link akun, track order, notifikasi, AI rekomendasi, checkout, dan membership.

**Architecture:**
- Bot berjalan di Hermes profile `mybagasi-ai` — semua logika ada di AGENTS.md / SOUL.md, bukan di file Python terpisah
- Supabase sebagai single source of truth — semua data dibaca dari REST API pakai `SUPABASE_SERVICE_ROLE_KEY`
- Edge Function untuk reverse webhook (notifikasi realtime dari DB ke Telegram)
- Cron job tiap 5-10 menit untuk polling status update (fallback kalau webhook gagal)
- Mayar API untuk pembuatan invoice checkout

**Tech Stack:** Hermes AI profile, Supabase REST + Edge Function, Mayar API, Telegram Bot API, Playwright (scrape)

---

## 📊 Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] Migration: telegram_token & index di profiles
  ├── [2] Migration: NOTIFY trigger untuk realtime
  └── [3] Migration: order tracking view

Level 2 (independen → paralel 🔥)
  ├── [4] AGENTS.md: /start TOKEN handler
  ├── [5] SOUL.md: /orders, /order commands
  ├── [6] Skill: order-tracking (data fetcher)
  ├── [7] Edge Function: notifikasi realtime
  └── [8] Cron: polling notifikasi fallback

Level 3 (independen → paralel 🔥)
  ├── [9] SOUL.md: AI rekomendasi + checkout flow
  ├── [10] Skill: membership-queries
  ├── [11] SOUL.md: /membership, /points
  └── [12] Command list update

Level 4 (verifikasi)
  └── [13] End-to-end test
```

---

## 🔥 Wave 1: Foundation & Link Akun

### Task 1: Migration — Add telegram_token & telegram_id to profiles

**Objective:** Kolom untuk link Telegram user ke profile MyBagasi.

**Files:**
- Create: `supabase/migrations/20260620000001_telegram_bot_token.sql`

```sql
-- Add telegram fields to profiles (if not exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_token TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_token ON profiles(telegram_token);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);

-- Function: generate new telegram_token
CREATE OR REPLACE FUNCTION generate_telegram_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.telegram_token IS NULL THEN
    NEW.telegram_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: auto-generate token on insert
DROP TRIGGER IF EXISTS trg_profiles_telegram_token ON profiles;
CREATE TRIGGER trg_profiles_telegram_token
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_telegram_token();

-- Function: rotate token (for /login)
CREATE OR REPLACE FUNCTION rotate_telegram_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  UPDATE profiles
  SET telegram_token = v_token, updated_at = NOW()
  WHERE id = p_user_id;
  RETURN v_token;
END;
$$;

-- Function: link telegram_id
CREATE OR REPLACE FUNCTION link_telegram(p_user_id UUID, p_telegram_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET telegram_id = p_telegram_id, updated_at = NOW()
  WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;
```

**Verifikasi:** Run migration di Supabase SQL Editor.

---

### Task 2: Migration — NOTIFY trigger untuk realtime order update

**Objective:** Trigger yang kirim notifikasi ke Postgres channel saat order berubah status.

**Files:**
- Create: `supabase/migrations/20260620000002_order_notify_trigger.sql`

```sql
-- Notify channel untuk order updates
CREATE OR REPLACE FUNCTION notify_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Notify via Postgres channel (untuk Edge Function subscribe)
  PERFORM pg_notify(
    'order_changes',
    json_build_object(
      'order_id', NEW.id,
      'user_id', NEW.user_id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'product', NEW.product,
      'tracking_number', NEW.tracking_number
    )::text
  );
  RETURN NEW;
END;
$$;

-- Trigger on orders table
DROP TRIGGER IF EXISTS trg_orders_notify ON orders;
CREATE TRIGGER trg_orders_notify
  AFTER UPDATE OF status, tracking_number ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.tracking_number IS DISTINCT FROM NEW.tracking_number)
  EXECUTE FUNCTION notify_order_update();

-- Also notify on order_tracking insert (timeline event)
CREATE OR REPLACE FUNCTION notify_order_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_product TEXT;
BEGIN
  SELECT user_id, product INTO v_user_id, v_product FROM orders WHERE id = NEW.order_id;
  PERFORM pg_notify(
    'order_changes',
    json_build_object(
      'order_id', NEW.order_id,
      'user_id', v_user_id,
      'status', NEW.status,
      'product', v_product,
      'note', NEW.note
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_tracking_notify ON order_tracking;
CREATE TRIGGER trg_order_tracking_notify
  AFTER INSERT ON order_tracking
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_tracking();
```

**Verifikasi:** Run migration di Supabase SQL Editor.

---

### Task 3: Migration — Order tracking view

**Objective:** View untuk query order user dengan status terbaru.

**Files:**
- Create: `supabase/migrations/20260620000003_order_views.sql`

```sql
-- View: user orders with latest status + timeline count
CREATE OR REPLACE VIEW user_orders_summary AS
SELECT
  o.id,
  o.user_id,
  o.product,
  o.source,
  o.total,
  o.status,
  o.tracking_number,
  o.eta,
  o.created_at,
  o.updated_at,
  COALESCE(ot.event_count, 0) AS timeline_events,
  ot2.last_event_note
FROM orders o
LEFT JOIN (
  SELECT order_id, COUNT(*) AS event_count
  FROM order_tracking
  GROUP BY order_id
) ot ON ot.order_id = o.id
LEFT JOIN LATERAL (
  SELECT note AS last_event_note
  FROM order_tracking
  WHERE order_id = o.id
  ORDER BY occurred_at DESC
  LIMIT 1
) ot2 ON TRUE
ORDER BY o.created_at DESC;

-- View: recent orders for notification check
CREATE OR REPLACE VIEW recent_order_updates AS
SELECT
  o.id,
  o.user_id,
  o.product,
  o.status,
  o.tracking_number,
  o.updated_at,
  p.telegram_id
FROM orders o
JOIN profiles p ON p.id = o.user_id
WHERE p.telegram_id IS NOT NULL
  AND o.updated_at > NOW() - INTERVAL '24 hours'
ORDER BY o.updated_at DESC;
```

**Verifikasi:** Run migration, test `SELECT * FROM user_orders_summary WHERE user_id = '...' LIMIT 5;`

---

### Task 4: SOUL.md — `/start TOKEN` handler

**Objective:** Ketika user kirim `/start ABC123`, bot cari profile by token → link telegram_id.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

**Tambah di bagian "Commands" setelah welcome section:**

```markdown
### `/start [TOKEN]` — Link Akun MyBagasi

**Flow:**
1. Jika TOKEN diberikan → cari di `profiles` where `telegram_token = eq.{token}`
2. Jika ditemukan → update `telegram_id = {chat_id}`
3. Simpan `user_id` ke conversation context
4. Response: "✅ Akun *{nama}* berhasil terhubung! 🎉"
5. Jika tidak ditemukan → "❌ Kode tidak valid. Cek halaman Profile di mybagasi.my.id"

**Query:**
```bash
# Lookup by token
curl -s "$SUPABASE_URL/rest/v1/profiles?telegram_token=eq.$TOKEN&select=id,name,email,telegram_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Link telegram_id via RPC
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/link_telegram" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_user_id":"$USER_ID","p_telegram_id":$CHAT_ID}'
```

**Error handling:**
- Token sudah ter-link ke Telegram lain → "Kode ini sudah dipakai. /login untuk generate baru."
- Telegram_id sudah ter-link ke akun lain → "Akun Telegram ini sudah terhubung ke *{nama}*"
- User belum register → arahkan ke `/register`
```

---

## 🔥 Wave 2: Order Tracking & Notifikasi Realtime

### Task 5: SOUL.md — `/orders` & `/order` commands

**Objective:** User bisa lihat daftar pesanan dan detail pesanan dari Telegram.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

**Tambah:**

```markdown
### `/orders` — Daftar Pesanan

**Flow:**
1. Cek `conversation.context.user_id` — harus sudah login
2. Query: `profiles(id=eq.{user_id})` → `join orders(user_id=eq.{user_id})` via `user_orders_summary`
3. Tampilkan 5 pesanan terbaru dalam format:

```
📦 *Pesanan Terbaru Kamu:*

1. ORD-001 — Sepatu Nike Air Max
   └ Status: ✅ Sampai
   └ Total: Rp1.200.000
   └ 12 Jun 2026

2. ORD-002 — Onitsuka Tiger Mexico
   └ Status: 🚚 Dalam Pengiriman
   └ Resi: JP123456789
   └ 15 Jun 2026

3. ORD-003 — Yamaha Vixion LED
   └ Status: ⏳ Procurement
   └ 18 Jun 2026

Ketik /order 001 untuk detail.
```

**Status → Emoji mapping:**
| Status | Emoji | Label |
|--------|-------|-------|
| draft | 📝 | Draft |
| quote_created | 💰 | Menunggu Persetujuan |
| waiting_payment | ⏳ | Menunggu Pembayaran |
| paid | ✅ | Dibayar |
| procurement_queue | ⏳ | Procurement |
| purchased | 🛍️ | Dibeli di Jepang |
| in_japan_warehouse | 🏭 | Di Gudang Jepang |
| packed | 📦 | Dikemas |
| shipped_to_indonesia | 🚢 | Dalam Perjalanan |
| customs_clearance | 🏛️ | Bea Cukai |
| last_mile_delivery | 🚚 | Kurir Lokal |
| delivered | ✅ | Sampai |
| cancelled | ❌ | Dibatalkan |
| refunded | 💳 | Dikembalikan |

---

### `/order <id>` — Detail Pesanan

**Flow:**
1. Cari order by id (orid ID pakai nomor, bukan UUID penuh)
2. Query order + timeline dari `order_tracking`
3. Response:

```
📦 *Detail Pesanan*

Produk: Onitsuka Tiger Mexico 66
Sumber: Rakuten Japan
Total: Rp1.350.000
Status: 🚚 Dalam Perjalanan
Resi: JP123456789
ETA: 25 Jun 2026

*Timeline:*
✅ 10 Jun — Pesanan dibuat
✅ 12 Jun — Pembayaran diterima
✅ 15 Jun — Dibeli di Jepang
✅ 18 Jun — Dikirim dari Jepang
🚚 20 Jun — Dalam perjalanan ke Indonesia
⏳ 25 Jun — Estimasi sampai

*Actions:*
/track 001 — Cek tracking terbaru
```

**Query:**
```bash
# Get order detail
curl -s "$SUPABASE_URL/rest/v1/user_orders_summary?id=eq.$ORDER_ID&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Get timeline
curl -s "$SUPABASE_URL/rest/v1/order_tracking?order_id=eq.$ORDER_ID&order=occurred_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

### `/track <order_id>` — Tracking Update

**Flow:** Sama seperti `/order` tapi highlight:
- Update terakhir
- Tracking number
- ETA
- Link ke tracking eksternal (jika ada)
```

---

### Task 6: Skill — order-tracking (data fetcher)

**Objective:** Skill yang bisa dipakai SOUL.md untuk query order data.

**Files:**
- Create: `~/.hermes/profiles/mybagasi-ai/skills/order-tracking/SKILL.md`

```markdown
---
name: order-tracking
description: "Fungsi untuk query order data dari Supabase"
---

# Order Tracking — Data Fetcher

## Fungsi

### get_user_orders(user_id: str, limit: int = 5) -> list[dict]
Query 5 pesanan terbaru dari `user_orders_summary` view.

```bash
curl -s "$SUPABASE_URL/rest/v1/user_orders_summary?user_id=eq.$USER_ID&order=created_at.desc&limit=$LIMIT" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### get_order_detail(order_id: str) -> dict
Query detail pesanan.

```bash
curl -s "$SUPABASE_URL/rest/v1/user_orders_summary?id=eq.$ORDER_ID&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### get_order_timeline(order_id: str) -> list[dict]
Query timeline dari order_tracking.

```bash
curl -s "$SUPABASE_URL/rest/v1/order_tracking?order_id=eq.$ORDER_ID&order=occurred_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### get_user_profile_by_telegram(telegram_id: int) -> dict | None
Lookup profile by telegram_id.

```bash
curl -s "$SUPABASE_URL/rest/v1/profiles?telegram_id=eq.$TELEGRAM_ID&select=id,name,email,tier,points_balance" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
```

---

### Task 7: Edge Function — Notifikasi Realtime Order Update

**Objective:** Edge Function yang subscribe ke Postgres NOTIFY dan kirim pesan ke Telegram user.

**Files:**
- Create: `supabase/functions/send-order-update/index.ts`

```typescript
// supabase/functions/send-order-update/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Status → emoji mapping
const STATUS_EMOJI: Record<string, string> = {
  draft: "📝", quote_created: "💰", waiting_payment: "⏳",
  paid: "✅", procurement_queue: "⏳", purchased: "🛍️",
  in_japan_warehouse: "🏭", packed: "📦", shipped_to_indonesia: "🚢",
  customs_clearance: "🏛️", last_mile_delivery: "🚚", delivered: "✅",
  cancelled: "❌", refunded: "💳",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", quote_created: "Menunggu Persetujuan",
  waiting_payment: "Menunggu Pembayaran", paid: "Dibayar",
  procurement_queue: "Procurement", purchased: "Dibeli di Jepang",
  in_japan_warehouse: "Di Gudang Jepang", packed: "Dikemas",
  shipped_to_indonesia: "Dalam Perjalanan", customs_clearance: "Bea Cukai",
  last_mile_delivery: "Kurir Lokal", delivered: "Sampai ✅",
  cancelled: "Dibatalkan ❌", refunded: "Dikembalikan 💳",
};

async function sendTelegram(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) console.error("Telegram send failed:", await res.text());
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const { order_id, user_id, new_status, product, tracking_number, note } = payload.type === "INSERT"
      ? { ...payload, new_status: payload.status }
      : payload;

    if (!user_id || !new_status) {
      return new Response("Missing fields", { status: 400 });
    }

    // Get user's telegram_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_id, name")
      .eq("id", user_id)
      .single();

    if (!profile?.telegram_id) {
      return new Response("No telegram linked", { status: 200 });
    }

    const emoji = STATUS_EMOJI[new_status] || "📌";
    const label = STATUS_LABEL[new_status] || new_status;
    const productShort = product?.length > 40 ? product.substring(0, 37) + "..." : product;

    let text = `${emoji} *Update Pesanan* 🎯\n\n`;
    text += `*${productShort}*\n`;
    text += `Status: ${emoji} ${label}\n`;

    if (tracking_number) {
      text += `Resi: \`${tracking_number}\`\n`;
    }
    if (note) {
      text += `Catatan: ${note}\n`;
    }

    text += `\nKetik /order untuk detail lengkap.`;

    await sendTelegram(profile.telegram_id, text);

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error:", err);
    return new Response("Error", { status: 500 });
  }
});
```

**Supabase Webhook Setup:**
- Dashboard → Database → Replication → Add `order_changes` channel
- Atau deploy Edge Function yang pake `serve()` + HTTP trigger dari webhook

---

### Task 8: Cron — Polling Notifikasi Fallback

**Objective:** Cron job tiap 10 menit untuk cek order terbaru dan kirim notifikasi jika ada status update dalam 10 menit terakhir.

**Files:**
- Create cron di Hermes profile

```bash
cronjob action=create \
  schedule="every 10m" \
  name="mybagasi-order-polling" \
  prompt="Cek tabel orders dan order_tracking untuk update dalam 10 menit terakhir. 
Query: SELECT * FROM recent_order_updates WHERE updated_at > NOW() - INTERVAL '10 minutes'
Untuk setiap row, kirim notifikasi Telegram ke user dengan format:
📦 Update Pesanan — {product}
Status: {emoji} {status_label}
Ketik /order untuk detail.

Gunakan SUPABASE_SERVICE_ROLE_KEY. Format status ke emoji sesuai database."
```

---

## 🔥 Wave 3: AI Rekomendasi & Checkout & Membership

### Task 9: SOUL.md & AGENTS.md — AI Rekomendasi Personal

**Objective:** Bot bisa kasih rekomendasi produk berdasarkan wishlist, order history, dan keyword.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md` (tambah section di bawah AI instructions)

**Tambah:**

```markdown
### AI Rekomendasi Personal

Ketika user minta rekomendasi (tanpa link atau keyword spesifik):

1. Cek `conversation.context.user_id`
2. Query wishlist user → `wishlist_items(user_id=eq.{user_id})`
3. Query order history → `orders(user_id=eq.{user_id}, order=created_at.desc, limit=5)`
4. Gabungkan data untuk konteks:
   - Produk yang pernah dicari/diwishlist
   - Brand favorit (dari order history)
   - Budget range (dari quotation history)

**Contoh response:**
```
🎯 *Rekomendasi untuk Kamu, {nama}!*

Berdasarkan wishlist dan pesanan sebelumnya:

1. 🏷️ *Onitsuka Tiger Mexico 66* — Rp1.200.000
   └ Cocok dengan gaya sepatumu sebelumnya!
   └ [Cari harga] atau [/beli]

2. 🏷️ *Yamaha Vixion LED Custom* — Rp3.500.000
   └ Masih di wishlist kamu nih!
   └ Cek harga terbaru → [/cek]

3. 🏷️ *Nike Air Max 90* — Rp1.800.000
   └ Tren populer bulan ini
   └ [/cari]

Ada yang menarik? Kirim kata kunci atau link untuk cek harga!
```

**Query:**
```bash
# Get wishlist items
curl -s "$SUPABASE_URL/rest/v1/wishlist_items?user_id=eq.$USER_ID&select=name,url,price_idr,source" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Get order history
curl -s "$SUPABASE_URL/rest/v1/orders?user_id=eq.$USER_ID&select=product,source,total,status,created_at&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

### Checkout dari Bot — `/beli <product>` Flow

**Flow lengkap:**

1. User: "beli onitsuka tiger ukuran 42"
2. Bot scrap harga dari marketplace Jepang (Rakuten, Yahoo Auction)
3. Bot hitung estimasi total:
   - Harga JPY + rate + service fee + shipping + tax
4. Bot tampilkan quotation:

```
💳 *Quotation — Onitsuka Tiger Mexico 66*

Harga: ¥12,000 (Rp1,320,000)
Rate: Rp110/¥
Service Fee: Rp50,000
Shipping (estimasi): Rp80,000
Tax & Customs: Rp132,000
────────────────
Total: *Rp1,582,000*

🔖 Diskon Member: Rp79,100 (5% — Free tier)
💰 Poin tersedia: 2,500 (bisa redeem Rp25,000)

📌 /setujui — Lanjutkan pesanan
📌 /edit — Ubah produk
📌 /batal — Batalkan
```

5. User `/setujui` → Bot buat record di `quotations` → create Mayar invoice → kirim link bayar
6. User bayar → Mayar webhook ke Edge Function → update status order → notifikasi ke Telegram

**Command check:**
```bash
# Get current rate
curl -s "$SUPABASE_URL/rest/v1/fee_settings?key=eq.exchange_rate&select=value"

# Get service fee
curl -s "$SUPABASE_URL/rest/v1/fee_settings?key=eq.service_fee&select=value"

# Get user points
curl -s "$SUPABASE_URL/rest/v1/profiles?id=eq.$USER_ID&select=points_balance,tier" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Get membership plan
curl -s "$SUPABASE_URL/rest/v1/membership_plans?name=eq.$TIER&select=discount_percent"

# Create Mayar invoice
curl -s -X POST "https://api.mayar.id/hl/v1/invoice/create" \
  -H "Authorization: Bearer $MAYAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ONITSUKA TIGER MEXICO 66","amount":1582000,"customer":{"email":"user@email.com"}}'
```
```

---

### Task 10: Skill — membership-queries

**Objective:** Skill untuk query data membership, poin, dan benefit.

**Files:**
- Create: `~/.hermes/profiles/mybagasi-ai/skills/membership-queries/SKILL.md`

```markdown
---
name: membership-queries
description: "Fungsi untuk query membership, poin, dan tier user"
---

# Membership Queries

## Fungsi

### get_user_membership(user_id: str) -> dict
Query profile + user_membership + membership_plans.

```bash
# Get profile
curl -s "$SUPABASE_URL/rest/v1/profiles?id=eq.$USER_ID&select=id,name,tier,points_balance" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"

# Get membership detail
curl -s "$SUPABASE_URL/rest/v1/user_memberships?user_id=eq.$USER_ID&select=*,membership_plans(*)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"

# Get point history (last 10)
curl -s "$SUPABASE_URL/rest/v1/points_ledger?user_id=eq.$USER_ID&order=created_at.desc&limit=10" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

### format_membership_response(profile: dict, membership: dict, points: list) -> str

Format membership info untuk Telegram:

```
🏆 *Membership Kamu*

Tier: *{tier}* {badge}
Poin: {points_balance} 💰
────────────────

*Benefit {tier}:*
✅ Diskon {discount_percent}% tiap order
✅ Poin {point_multiplier}x lebih cepat
✅ Prioritas procurement

*Progress ke {next_tier}:*
Rp{spent_amount} / Rp{target_amount}
[████░░░░░░] 40%

*Riwayat Poin:*
+500 order ORD-001 (12 Jun)
+200 bonus referral (10 Jun)
-1,000 redeem pesanan (5 Jun)

*Poin akan expire:*
25 poin pada 30 Jun 2026

🔗 Upgrade: mybagasi.my.id/membership
```

### Tier badge mapping:
| Tier | Badge |
|------|-------|
| Free | 🆓 |
| Plus | ⭐ |
| Pro | 💎 |
| Seller | 👑 |
```

---

### Task 11: SOUL.md — `/membership` & `/points` Commands

**Objective:** User bisa cek tier membership, poin balance, dan history dari Telegram.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

**Tambah:**

```markdown
### `/membership` — Cek Membership

**Flow:**
1. Cek `conversation.context.user_id`
2. Query profile → tier, points_balance
3. Query user_memberships → spent_amount, target_amount
4. Query points_ledger → 5 history terakhir
5. Format response dengan tier badge + progress bar

**Contoh output:**
```
🏆 *Membership Kamu*

Tier: *Free* 🆓
Poin: 2,500 💰
─────────────────

*Benefit Free:*
✅ Diskon 0% tiap order
✅ Poin 1x per transaksi

*Upgrade ke Plus* — Rp100,000/bulan
✅ Diskon 5% tiap order
✅ Poin 2x lebih cepat
✅ Prioritas procurement
🔗 mybagasi.my.id/membership

*Riwayat Poin:*
📈 +500 — Order ORD-001 (12 Jun)
📈 +200 — Bonus referral (10 Jun)
📉 -1,000 — Redeem pesanan (5 Jun)
```

---

### `/points` — Cek Poin & Redeem

**Flow:**
1. Query profile → points_balance
2. Query points_ledger → earn/redeem history
3. Tampilkan:
   - Total poin
   - History transaksi poin
   - Cara redeem: "Gunakan /beli dan sebut 'pakai poin'"

---

### `/unlink` — Putuskan Akun

**Flow:**
1. Set `profiles.telegram_id = NULL` untuk user
2. Hapus `conversation.context.user_id`
3. "Akun Telegram berhasil diputuskan dari MyBagasi. /register untuk menghubungkan lagi."
```

---

### Task 12: Update Command List

**Objective:** Tambah command baru ke Telegram bot command list.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/scripts/set-telegram-commands.py`

Tambah ke command list:
```
/orders — Daftar pesanan
/order — Detail pesanan
/membership — Cek membership & tier
/points — Cek poin saya
/unlink — Putuskan akun Telegram
```

Update juga `/help` response di SOUL.md untuk mencakup semua command baru.

---

## ⚠️ Pitfalls

1. **Race condition trigger** — `handle_new_user()` mungkin belum selesai sebelum bot baca profile setelah register. Selalu retry 5x dengan interval 500ms.

2. **Telegram ID unik** — Satu Telegram ID hanya boleh ter-link ke satu akun MyBagasi. Cek dulu sebelum link.

3. **Order ID format** — User akan lihat `ORD-001` di response, bukan UUID panjang. Simpan mapping nomor → UUID di state atau gunakan `SUBSTRING(id::text, 1, 8)`.

4. **Mayar invoice duplikat** — Jangan create Mayar invoice 2x untuk quotation yang sama. Cek `payments` table dulu.

5. **Rate limit Telegram** — 20 messages/min per chat_id. Kalau kirim banyak notifikasi, delay 200ms antar message.

6. **Pending state loss on restart** — State conversation hilang saat Hermes restart. User harus `/reset` atau mulai ulang. Acceptable untuk MVP.

7. **Webhook vs Polling** — Edge Function webhook lebih realtime, tapi butuh endpoint publik. Alternatif: cron polling tiap 5-10 menit.

8. **Token uppercase** — User mungkin ketik lowercase. Selalu `.upper()` sebelum komparasi.

9. **Email normalization** — Selalu `.lower().strip()` untuk lookup email.

10. **Password di chat** — Password hanya diketik sekali, langsung diproses, jangan di-log, dan `password = ""` setelahnya.

---

## ✅ Verifikasi End-to-End

| Step | Test | Cara |
|------|------|------|
| Link akun | `/start ABC123` di bot | Cek `profiles.telegram_id` terisi |
| Orders | `/orders` | Data dari `user_orders_summary` |
| Order detail | `/order 001` | Timeline muncul |
| Notifikasi | Update status order di DB | User terima pesan Telegram |
| AI rekomendasi | "rekomendasi barang" | Response berdasarkan wishlist |
| Checkout | `/beli onitsuka tiger` | Quotation → Mayar invoice |
| Membership | `/membership` | Tier + benefit + poin |
| Points | `/points` | Balance + history |
| Unlink | `/unlink` | `telegram_id` jadi NULL |
