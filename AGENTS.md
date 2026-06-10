# MyBagasi Project — AI Agent Playbook

## 1. Project Layout
```
/opt/mybagasi/
├── scraper/                  # OLD — didecommission, jangan dipakai
│   ├── telegram_bot.py       # OLD
│   ├── scrapers/             # OLD
│   └── main.py               # OLD
├── docs/plans/               # Rencana implementasi — baca untuk konteks
└── supabase/migrations/      # SQL migrations — jangan diedit manual
```

## 2. Workflow: Cari Produk (keyword → search)

**Tujuan:** User minta barang dari Japan → cari di marketplace.

**Steps:**
1. Tanya user: keyword, budget (opsional), preferensi marketplace (opsional).
2. Pilih marketplace berdasarkan keyword:
   - Elektronik/fashion → Yahoo Auction, Mercari, Rakuten
   - Buku → Amazon JP, Rakuten
   - Koleksi → Yahoo Auction, Mercari
3. Buka URL pencarian di browser, screenshot hasil, kirim ke user.
4. Minta user pilih link spesifik, lalu lanjut ke Workflow Scrape URL.

```bash
# Contoh: Yahoo Auction search
https://page.auctions.yahoo.co.jp/search?p=KEYWORD&auccat=0
# Contoh: Mercari search
https://jp.mercari.com/search?keyword=KEYWORD
```

**Curl tidak relevan untuk search — ini operasi browser.**

---

## 3. Workflow: Scrape URL (link → harga)

**Tujuan:** Dapatkan harga Jepang (JPY) dari link produk.

**Fallback 4 level:**

| Level | Tool | Jika gagal |
|-------|------|------------|
| 1 | `web_extract(url)` — extract text dari HTML | Turun level 2 |
| 2 | `web_extract(url + tanpa query params)` — bersihkan URL | Turun level 3 |
| 3 | `browser_navigate(url)` + `browser_vision()` — screenshot | Turun level 4 |
| 4 | Tanya user: "Bisa kirim screenshot harga?" | Gagal total |

**Setelah sukses:**
1. Format: `「Nama Barang」— RpX.XXX.XXX (¥XX.XXX + fees)`
2. Hitung estimasi: `harga_total = harga_jpy * kurs_saat_ini + (harga_jpy * 0.1) + ongkos_kirim + fee_lain`
   - Kurs: ~Rp105 per JPY (cek terbaru)
   - Biaya: 10% jastip, ongkir lokal Japan Rp50rb-100rb, ongkir internasional Rp200rb-500rb/kg
   - Fee admin: Rp25.000
3. Simpan quotation ke Supabase.
4. Tanya user: lanjut checkout? (buat invoice Mayar)

```bash
# Simpan quotation
curl -s -X POST "$SUPABASE_URL/rest/v1/quotations" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"  # JWT dari login user \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "user_id":"UUID_PENGGUNA",
    "product_name":"Nintendo Switch OLED",
    "product_url":"https://jp.mercari.com/item/abc123",
    "price_jpy":35000,
    "price_idr_est":5250000,
    "marketplace":"mercari",
    "status":"pending"
  }'
```

---

## 4. Workflow: Link Akun (/start TOKEN)

**Tujuan:** User daftar via Telegram → link akun Hermes + Telegram.

**Steps:**
1. User kirim `/start <TOKEN>` ke bot.
2. Cari token di tabel `profiles`:
   ```sql
   SELECT * FROM profiles WHERE telegram_token = '<TOKEN>' AND telegram_id IS NULL;
   ```
3. Jika token valid:
   - Update `profiles`:
     ```sql
     UPDATE profiles SET telegram_id = '<TELEGRAM_ID>', telegram_token = NULL WHERE telegram_token = '<TOKEN>';
     ```
   - Balas: "✅ Akun berhasil ditautkan! Selamat datang, [NAMA]!"
4. Jika token tidak ditemukan atau sudah dipakai:
   - Balas: "❌ Token tidak valid atau sudah digunakan. Hubungi admin."

```bash
# Cari token
curl -s "$SUPABASE_URL/rest/v1/profiles?telegram_token=eq.$TOKEN&telegram_id=is.null" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"  # JWT dari login user
# Update link
curl -s -X PATCH "$SUPABASE_URL/rest/v1/profiles?telegram_token=eq.$TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"  # JWT dari login user \
  -H "Content-Type: application/json" \
  -d '{"telegram_id":"'$TELEGRAM_ID'","telegram_token":null}'
```

---

## 5. Workflow: Register (/register)

**Tujuan:** User baru buat akun.

**Steps:**
1. User kirim `/register` — balas minta: nama, email, password.
2. Kumpulkan data via percakapan.
3. Panggil Supabase Auth Admin API:
   ```bash
   curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $USER_JWT"  # JWT dari login user \
     -H "Content-Type: application/json" \
     -d '{
       "email":"user@email.com",
       "password":"password123",
       "email_confirm":true,
       "user_metadata":{"name":"Nama User","registered_via":"telegram"}
     }'
   ```
4. Ambil `user_id` dari response Auth, insert ke `profiles`:
   ```bash
   curl -s -X POST "$SUPABASE_URL/rest/v1/profiles" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $USER_JWT"  # JWT dari login user \
     -H "Content-Type: application/json" \
     -H "Prefer: return=representation" \
     -d '{
       "id":"UUID_DARI_AUTH",
       "name":"Nama User",
       "email":"user@email.com",
       "telegram_id":"TELEGRAM_INT_ID",
       "telegram_token":"generate_random_token_here"
     }'
   ```
5. Generate random 32-char token untuk /start.
6. Balas user: "✅ Akun berhasil dibuat! Kirim `/start <TOKEN>` untuk tautkan akun."

---

## 6. Marketplace Patterns

### Yahoo Auction
| Aspek | Detail |
|-------|--------|
| **URL pattern** | `https://page.auctions.yahoo.co.jp/jp/auction/ITEM_ID` |
| **Search URL** | `https://page.auctions.yahoo.co.jp/search?p=KEYWORD` |
| **Harga selector** | Cari `¥` di extracted text, ambil angka setelahnya |
| **Scrape tool** | `web_extract` dulu, fallback `browser_vision` |
| **Rate limit** | 10 req/menit — kena 429, tunggu 10 detik |
| **Notes** | Item ID biasanya `k1234567890` atau `w1234567890` |

### Mercari
| Aspek | Detail |
|-------|--------|
| **URL pattern** | `https://jp.mercari.com/item/ITEM_ID` |
| **Search URL** | `https://jp.mercari.com/search?keyword=KEYWORD` |
| **Harga selector** | Cari pola `¥N,NNN` atau `¥NNNNN` di text |
| **Scrape tool** | `browser_navigate` + `browser_vision` (JS-heavy) |
| **Rate limit** | 5 req/menit — agresif blokir IP |
| **Notes** | Item ID = 13-14 char hex. Sering block headless. Fallback browser vision wajib. |

### Rakuten
| Aspek | Detail |
|-------|--------|
| **URL pattern** | `https://item.rakuten.co.jp/SHOP/ITEM_ID/` |
| **Search URL** | `https://search.rakuten.co.jp/search/mall/KEYWORD/` |
| **Harga selector** | Cari `価格` atau `¥` di extracted text |
| **Scrape tool** | `web_extract` — mostly works, HTML friendly |
| **Rate limit** | 20 req/menit — cukup longgar |
| **Notes** | Shop name + item ID. Kadang redirect ke mobile site. |

### Amazon Japan
| Aspek | Detail |
|-------|--------|
| **URL pattern** | `https://www.amazon.co.jp/dp/ASIN` |
| **Search URL** | `https://www.amazon.co.jp/s?k=KEYWORD` |
| **Harga selector** | Cari `¥` atau `￥` di text. Harga bisa beda per seller. |
| **Scrape tool** | `web_extract` — Amazon anti-scrape ringan |
| **Rate limit** | 5 req/menit — strict CAPTCHA jika kencang |
| **Notes** | ASIN = 10 char alfanumerik. Kadang perlu `browser_vision` karena JS render. |

---

## 7. Error Recovery

### Supabase Errors
| HTTP | Kode | Penyebab | Tindakan | User-facing |
|------|------|----------|----------|-------------|
| 404 | PGRST116 | Row tidak ditemukan (single row query kosong) | Cek apakah data sudah ada; kalau expected → skip | "Data tidak ditemukan" |
| 406 | PGRST116 | Sama, versi lain | Gunakan `Accept: application/vnd.pgrst.object+json` + handle null | — |
| 404 | PGRST202 | Endpoint/kolom tidak dikenal | Cek nama tabel/kolom (snake_case vs camelCase) | "Terjadi kesalahan sistem" |
| 429 | — | Rate limit Supabase | Tunggu 5 detik, retry 1x | "Server sibuk, coba lagi" |
| 500 | — | Internal server error | Retry 1x dengan delay 3 detik | "Server error, coba lagi nanti" |
| 502 | — | Bad gateway | Retry 1x | "Koneksi terganggu" |
| 503 | — | Service unavailable | Retry 1x, kalau gagal kasih tau user | "Layanan sedang maintenance" |

### Scrape Errors
| HTTP | Penyebab | Tindakan | User-facing |
|------|----------|----------|-------------|
| 403 | Blocked by marketplace | Fallback level 3 (browser_vision) | "Halaman terblokir, coba metode lain" |
| 404 | Halaman tidak ditemukan | Cek URL, tanya user | "Link tidak valid" |
| 429 | Rate limited | Tunggu 10-30 detik, retry | "Terlalu banyak request, tunggu sebentar" |
| 5xx | Server marketplace down | Coba 1x lagi, lalu skip | "Marketplace sedang gangguan" |
| Timeout | Load terlalu lambat | Fallback web_extract tanpa query params | "Halaman terlalu lama dimuat" |

### Payment (Mayar) Errors
| HTTP | Penyebab | Tindakan | User-facing |
|------|----------|----------|-------------|
| 401 | API key invalid | Cek MAYAR_API_KEY di .env | "Pembayaran bermasalah, hubungi admin" |
| 422 | Bad request body | Cek format amount, customer, dll | "Data pesanan tidak valid" |
| 5xx | Mayar down | Simpan order sebagai "pending" | "Pembayaran sedang gangguan" |

### Rate Limit Strategy
| Marketplace | Limit | Cooldown | Headers to check |
|-------------|-------|----------|------------------|
| Yahoo Auction | 10/mnt | 10 detik | `Retry-After` |
| Mercari | 5/mnt | 15 detik | `X-RateLimit-Remaining` |
| Rakuten | 20/mnt | 5 detik | — |
| Amazon JP | 5/mnt | 15 detik | `x-amz-*` |
| Supabase | 30/mnt | 5 detik | `Retry-After` |

---

## 8. Database Reference

### Tables
| Table | Primary Key | Key Columns | Notes |
|-------|-------------|-------------|-------|
| `profiles` | `id` (UUID) | `name`, `email`, `telegram_id`, `telegram_token`, `created_at` | Telegram token 32-char random, null setelah link |
| `quotations` | `id` (UUID) | `user_id`, `product_name`, `product_url`, `price_jpy`, `price_idr_est`, `marketplace`, `status`, `created_at` | Status: pending/accepted/rejected |
| `orders` | `id` (UUID) | `user_id`, `quotation_id`, `invoice_url`, `total_idr`, `status`, `payment_method`, `created_at` | Status: pending/paid/shipped/delivered/cancelled |
| `transactions` | `id` (UUID) | `order_id`, `amount`, `type`, `status`, `maya r_invoice_id`, `created_at` | Type: payment/refund |

### Views
| View | Description |
|------|-------------|
| `user_orders` | Join orders + quotations untuk user dashboard |
| `payment_pending` | Orders with status pending di Mayar |

### RPC Functions
| Function | Parameters | Returns | Usage |
|----------|------------|---------|-------|
| `link_telegram(token, telegram_id)` | text, bigint | json | Link akun via /start |
| `get_user_orders(user_id)` | UUID | SETOF orders | Riwayat pesanan user |
| `create_order_from_quotation(quotation_id)` | UUID | json | Konversi quotation ke order |

### Status → Emoji
| Status | Emoji | Meaning |
|--------|-------|---------|
| `pending` | ⏳ | Menunggu diproses |
| `paid` | ✅ | Sudah dibayar |
| `shipped` | 📦 | Dalam pengiriman |
| `delivered` | 🏠 | Sampai tujuan |
| `cancelled` | ❌ | Dibatalkan |
| `accepted` | 👍 | Disetujui user |
| `rejected` | 👎 | Ditolak user |
| `refunded` | 💰 | Dana dikembalikan |

---

## 9. Payment (Mayar)

**Branding:** "Zantara Pay" — jangan pakai "DjiwaApp" atau "Mayar"

### Create Invoice
```bash
curl -s -X POST "https://api.mayar.id/hl/v1/invoice" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5250000,
    "customerName": "Nama User",
    "customerEmail": "user@email.com",
    "customerPhone": "08123456789",
    "description": "MyBagasi — Nintendo Switch OLED (¥35,000)",
    "expiredDate": "2026-06-25 23:59:59",
    "paymentMethod": ["GoPay", "OVO", "Bank Transfer", "QRIS"]
  }'
```
Response: `{ "status": true, "data": { "url": "https://app.mayar.id/invoice/INV-XXX", "id": "INV-XXX" } }`

### Check Payment Status
```bash
curl -s "https://api.mayar.id/hl/v1/invoice/INV-XXX" \
  -H "Authorization: Bearer ***
```
Response status: `waiting` / `paid` / `expired` / `cancelled`

### Alur Checkout
1. Buat quotation → user setuju → create Mayar invoice.
2. Simpan order di Supabase dengan `status=pending`, `invoice_url=URL`.
3. Kirim link pembayaran ke user: "🔗 Klik untuk bayar: [link]"
4. Poll status tiap 30 detik (max 10x). Kalau `paid` → update order + kirim konfirmasi.
5. Kalau `expired` → tanya user: buat invoice baru?

```bash
# Simpan order setelah create invoice
curl -s -X POST "$SUPABASE_URL/rest/v1/orders" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"  # JWT dari login user \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "user_id":"UUID_PENGGUNA",
    "quotation_id":"UUID_QUOTATION",
    "invoice_url":"https://app.mayar.id/invoice/INV-XXX",
    "total_idr":5250000,
    "status":"pending",
    "payment_method":"bank_transfer"
  }'
```

---

## 10. Command Reference

| Command | Description | Workflow |
|---------|-------------|----------|
| `/start` | Mulai bot | Balas sambutan + instruksi |
| `/start <TOKEN>` | Link akun Telegram | Workflow #4 |
| `/register` | Daftar akun baru | Workflow #5 |
| `/cari <keyword>` | Cari produk | Workflow #2 |
| `/harga <url>` | Cek harga produk | Workflow #3 |
| `/pesanan` | Lihat riwayat pesanan | Query orders table |
| `/bantuan` | Bantuan | Balas command list |
| `/admin` | Panel admin (jika authorized) | Cek role di profiles |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/admin/users` | List all users |
| `/admin/orders` | List all orders |
| `/admin/order <ID>` | Detail order + update status |

---

## 11. Environment Variables

```bash
# Wajib ada di profile .env
TELEGRAM_BOT_TOKEN='...'
SUPABASE_URL='https://xxx.supabase.co'
# AMAN: Bot sekarang pakai anon key + JWT user
# Service role key hanya ada di Edge Functions
SUPABASE_ANON_KEY='...'
DEEPSEEK_API_KEY='...'
DEEPSEEK_BASE_URL='https://api.deepseek.com'
DEEPSEEK_MODEL='deepseek-chat'
MAYAR_API_KEY='...'
MAYAR_WEBTOKEN='...'
PAYMENT_BRAND='Zantara Pay'
```

---

## 12. Quick Reference — Curl Cheatsheet

```bash
# === PROFILES ===
# Get user by telegram_id
curl -s "$SUPABASE_URL/rest/v1/profiles?telegram_id=eq.$TG_ID" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"  # JWT dari login user

# === AUTH ===
# Register user
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"  # JWT dari login user \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"...","email_confirm":true}'

# === PAYMENT ===
# Create invoice
curl -s -X POST "https://api.mayar.id/hl/v1/invoice" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{"amount":500000,"customerName":"User","customerEmail":"a@b.com","description":"Test"}'

# Check invoice status
curl -s "https://api.mayar.id/hl/v1/invoice/INV-XXX" \
  -H "Authorization: Bearer ***
```
