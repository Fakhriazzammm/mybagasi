# MyBagasi AI Bot — Rencana Pengembangan

## Visi
Setiap aksi user di bot Telegram (@mybagasibot) tersimpan ke Profil masing-masing dan tampil di Dashboard MyBagasi (mybagasi.my.id).

---

## Fase 1: Integrasi Data per User (NOW — prioritas)

### 1.1 Simpan Quotation dari Bot ke Supabase
**Lokasi**: `telegram_bot.py` → setelah `scrape_product` atau `search_products` + AI quote
**Tujuan**: Hasil scrape/quote user di bot muncul di halaman `/dashboard/quotations`

```
Bot: user kirim link → scrape → AI quote
     ↓
Supabase: INSERT INTO quotations (user_id, product, price_jpy, service_fee, shipping_cost, tax_customs, total, source, url, status)
     ↓
Dashboard: /dashboard/quotations → SELECT * FROM quotations WHERE user_id = auth.uid()
```

**File berubah**:
- `telegram_bot.py` — tambah `create_quotation(data)` + `create_order(data)` call setelah AI selesai
- `Profile.tsx` — sudah siap, data otomatis muncul

### 1.2 Simpan Order dari Bot ke Supabase
**Lokasi**: `telegram_bot.py` → setelah user konfirmasi beli + `create_payment` sukses
**Tujuan**: Order dari bot muncul di `/dashboard/orders`

### 1.3 Wishlist via Bot
**Lokasi**: `telegram_bot.py` → command `/simpan` atau button setelah quote
**Tujuan**: Produk favorit tersimpan di `/dashboard/wishlist`

---

## Fase 2: Inline Buttons + Media (1-2 hari)

### 2.1 Inline Buttons untuk Quote
Setelah AI ngasi quote, kirim pesan dengan inline keyboard:
```
[✅ Beli Sekarang] [📋 Simpan] [🔔 Pantau Harga]
```

- ✅ Beli → flow checkout (minta nama, email, HP → create_payment)
- 📋 Simpan → INSERT INTO wishlist_items
- 🔔 Pantau Harga → INSERT INTO price_alerts

### 2.2 Kirim Gambar Produk
Hasil scrape punya `images[]`. Bot kirim foto produk + caption quote.

### 2.3 Format Pesan Rapi
```
📍 Nama Produk
💰 JPY 15.000 (Rp 1.575.000)
🏪 Mercari

Estimasi All-in:
• Harga: Rp 1.575.000
• Fee (15%): Rp 236.250
• Ongkir: Rp 250.000
• Pajak: Rp 144.900
━━━━━━━━━━━━━━━━━
Total: Rp 2.206.150
```

---

## Fase 3: Dashboard per User (2-3 hari)

### 3.1 Dashboard "Aktivitas Bot" Widget
Halaman `/dashboard/overview` — tambah card:
```
┌──────────────────────────────┐
│  🤖 Aktivitas Telegram Bot  │
├──────────────────────────────┤
│  🔍 12 produk dicari         │
│  📋 5 quotation dibuat       │
│  💳 3 order diproses         │
│  📅 Terakhir: 2 jam lalu     │
└──────────────────────────────┘
```

### 3.2 Riwayat Pencarian di Dashboard
Halaman `/dashboard/quotations` — filter: `source = 'telegram_bot'`
Menampilkan quotation yang dibuat via bot.

### 3.3 Notifikasi Order Update ke Bot
Cron job: cek order user yang `telegram_id` terisi → status berubah → kirim notif.

```
┌──────────────────────────────┐
│  📦 Order Update!            │
│                              │
│  Onitsuka Tiger Mexico 66    │
│  Status: 📍 Dalam perjalanan │
│  ETA: 3-5 hari lagi          │
│                              │
│  Cek detail: /order ABC123   │
└──────────────────────────────┘
```

---

## Fase 4: AI Upgrade (3-5 hari)

### 4.1 Image Recognition
User kirim foto ke bot → forward ke DeepSeek vision → ekstrak produk → cari harga.

### 4.2 Persisten Memory
Simpan history chat per user di Supabase.
```sql
CREATE TABLE bot_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  messages JSONB,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Multi-Turn Context
Bot ingat produk sebelumnya, budget, preferensi user.

---

## Fase 5: Admin & Operasional (5-7 hari)

### 5.1 Admin Bot Commands
Hanya untuk role `ops_admin` / `super_admin`:
- `/procurement` — lihat antrian pembelian
- `/approve <id>` — approve quotation
- `/orders` — semua order hari ini
- `/support` — catatan support

### 5.2 Broadcast ke User Terlink
Admin kirim promosi / update via bot ke semua user yang sudah link Telegram.

---

## Architecture Data Flow

```
User → @mybagasibot
  │
  ├── Kirim link / keyword
  │     │
  │     ▼
  ├── DeepSeek AI + Tool Calling
  │     │
  │     ├── scrape_product(url) → scraper API → data
  │     ├── search_products(keyword) → scraper API → results
  │     └── create_payment(data) → Mayar API → invoice link
  │
  └── Simpan ke Supabase (per user_id)
        │
        ├── quotations (source='telegram_bot')
        ├── orders (source='telegram_bot')
        ├── wishlist_items
        └── price_alerts
              │
              ▼
        Dashboard MyBagasi
        /dashboard/quotations
        /dashboard/orders
        /dashboard/wishlist
        /dashboard → widget aktivitas
```

---

## Prioritas Eksekusi

| Fase | Estimasi | Dampak |
|------|----------|--------|
| ⚡ **Fase 1** — Simpan data bot per user | 1 hari | Wajib — data muncul di dashboard |
| ⚡ **Fase 2** — Inline buttons + gambar | 1-2 hari | UX naik drastis |
| 🔵 **Fase 3** — Dashboard widget + notif | 2-3 hari | User engagement |
| 🟡 **Fase 4** — AI vision + memory | 3-5 hari | Fitur unik |
| 🟠 **Fase 5** — Admin tools | 5-7 hari | Operational efficiency |
