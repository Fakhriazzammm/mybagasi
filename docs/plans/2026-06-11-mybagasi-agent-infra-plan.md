# MyBagasi Bot — Agent Infrastructure Plan

> **Untuk Hermes:** Implementasi task-by-task via profile `mybagasi-ai`. Baca SOUL.md + skills yang ada sebelum mulai.

**Goal:** Membangun infrastruktur pendukung MyBagasi AI bot — AGENTS.md komprehensif, error recovery sistematis, debug scripts, scrape patterns, dan monitoring.

**Architecture:**
- **AGENTS.md** sebagai "bible" workflow — semua langkah scraping, error handling, dan marketplace patterns di satu tempat
- **Scripts** di `~/.hermes/profiles/mybagasi-ai/scripts/` untuk debugging CLI
- **Error classification matrix** di SOUL.md sebagai panduan cepat
- **Cron jobs** untuk health check dan data cleanup

**Tech Stack:** Bash, Python, Supabase REST API, Telegram Bot API

---

## 📊 Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] AGENTS.md — rewrite total (workflow + marketplace patterns)
  ├── [2] SOUL.md — tambah error classification matrix
  └── [3] Script: test-rpc.sh

Level 2 (independen → paralel 🔥)
  ├── [4] Script: debug-scrape.sh
  ├── [5] Script: test-flow.sh
  └── [6] SOUL.md — tambah payment monitoring command

Level 3 (independen → paralel 🔥)
  ├── [7] Cron: health check
  ├── [8] Cron: data cleanup
  └── [9] Script: test-edge-function.sh

Level 4 (verifikasi)
  └── [10] Build test + verifikasi
```

---

## 🔥 Wave 1: Foundation (P1)

### Task 1: AGENTS.md — Rewrite Total

**Objective:** `AGENTS.md` jadi "Agent Playbook" lengkap — workflow scraping, error recovery, marketplace patterns, database reference.

**Files:**
- Modify: `/opt/mybagasi/AGENTS.md`

**Complete content:**

```markdown
# MyBagasi AI — Agent Playbook

## Project Layout
```
/opt/mybagasi/
├── supabase/
│   ├── migrations/          # SQL migrations (1 file per change)
│   └── functions/           # Edge Functions
├── docs/plans/              # Implementation plans
└── scraper/                 # OLD — akan didecommission
```

---

## Workflow: Cari Produk (keyword → search)

**Trigger:** User kirim nama produk (bukan URL)

```
Step 1: web_search("PRODUK site:mercari.com OR site:rakuten.co.jp")
        → 3-5 hasil tiap marketplace
Step 2: Format hasil → "1. Nama — ¥X — Marketplace"
Step 3: User pilih nomor → scrape URL itu
Step 4: Auto-run estimate-price setelah scrape
```

**Multi-marketplace search command:**
```bash
# Cari di Mercari
curl -s "https://www.mercari.com/jp/search/?keyword=ONITSUKA+TIGER" | ...
# Cari di Yahoo Auction
web_search("ONITSUKA TIGER site:page.auctions.yahoo.co.jp")
```

**Fallback:** Kalau search kosong → coba dengan keyword lebih sederhana → coba di 1 marketplace spesifik.

---

## Workflow: Scrape URL (link → harga)

**Trigger:** User kirim URL marketplace

```
Level 1: web_extract([URL])
  → Parse harga dari HTML response
  → Kalau berhasil → estimate-price

Level 2: browser_navigate + browser_vision
  → Kalau web_extract gagal (blocked, JS-rendered)
  → Screenshot → vision_analyze("Apa harga produk ini?")
  → Kalau berhasil → estimate-price

Level 3: web_search with keyword from URL
  → Kalau browser gagal (timeout, not found)
  → Cari produk yang sama via keyword
  → Kalau berhasil → tampilkan hasil search

Level 4: "Maaf, halaman ini tidak bisa dibaca. Coba link lain atau keyword."
```

**Auto-save ke database:**
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/quotations" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPAB...n" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"user_id":"...", "product":"...", "price_jpy": 10000, "total": 1500000, "status":"active"}'
```

---

## Workflow: Link Akun (/start TOKEN)

**Trigger:** User kirim `/start ABC123`

```
Step 1: Cek conversation.context.user_id → sudah login?
  → Ya → "Kamu sudah login sebagai {nama}"
Step 2: Cari profiles by telegram_token = TOKEN
Step 3: Update telegram_id via PATCH
Step 4: Save user_id ke context
Step 5: "✅ Berhasil terhubung! Selamat berbelanja!"
```

---

## Workflow: Register (/register)

**Trigger:** `/register` atau "daftar"

```
Step 1: Load skill_view("user-register")
Step 2: Ikuti multi-step flow: nama → email → password → verify
Step 3: Panggil Supabase Auth Admin API
Step 4: Kirim token → user verify
Step 5: Bot aktif 🚀
```

---

## Marketplace Patterns

### Yahoo Auction
| Aspek | Detail |
|-------|--------|
| URL pattern | `https://page.auctions.yahoo.co.jp/jp/auction/{id}` |
| Katalog | `https://page.auctions.yahoo.co.jp/jp/auction/*` (listing page) |
| Harga | Cari span/div dengan class mengandung "Price" atau "price" |
| Judul | Tag h1 atau meta[property='og:title'] |
| Gambar | meta[property='og:image'] |
| Scrape tools | `web_extract` biasanya cukup. `browser` untuk JS-rendered |
| Rate limit | ~10 request/menit. Delay 2s antar request |

### Mercari
| Aspek | Detail |
|-------|--------|
| URL pattern | `https://jp.mercari.com/item/{id}` |
| Katalog | `https://jp.mercari.com/search?keyword={q}` |
| Harga | `span[data-testid='price']` atau `p[class*='price']` |
| Judul | `h1` atau `div[data-testid='item-name']` |
| Gambar | `img[alt*='item']` |
| Scrape tools | `web_extract` sering kena block. `browser` lebih stabil |
| Notes | Mercari blokir request tanpa User-Agent. Set header `User-Agent: Mozilla/5.0` |

### Rakuten
| Aspek | Detail |
|-------|--------|
| URL pattern | `https://item.rakuten.co.jp/{shop}/{id}/` |
| Katalog | `https://search.rakuten.co.jp/search/mall/{keyword}/` |
| Harga | `span[class*='price']` atau `p[class*='price']` |
| Scrape tools | `web_extract` cukup. Rakuten jarang block |
| Notes | Harga di Rakuten sudah include tax (10%) |

### Amazon JP
| Aspek | Detail |
|-------|--------|
| URL pattern | `https://www.amazon.co.jp/dp/{asin}` |
| Harga | `span[class*='a-price-whole']` atau `span[data-a-size='xl']` |
| Scrape tools | `browser` wajib. Amazon block semua web_extract |
| Notes | Harga bisa dinamis. Cek juga "used" price |

---

## Error Recovery

### Supabase Errors

| HTTP | Kode | Penyebab | Tindakan Bot | User-facing |
|------|------|----------|-------------|-------------|
| 200 | PGRST116 | Record not found | Jangan sebut error | "Tidak ditemukan" |
| 200 | PGRST202 | Function/table not exists | Jangan sebut | "Fitur belum tersedia" |
| 200 | PGRST204 | Column name mismatch (camelCase?) | Cek konvensi nama | "Coba lagi nanti" |
| 200 | PGRST301 | RLS blocked query | Cek service_role key | — (internal) |
| 400 | — | Bad request (invalid data) | Validasi payload | "Data tidak valid" |
| 401 | — | Invalid API key | Cek .env | — (internal) |
| 404 | — | Endpoint not found | Cek URL path | — (internal) |
| 429 | — | Rate limit exceeded | Delay 5s, retry 1x | "Mohon tunggu sebentar" |
| 5xx | — | Server error | Retry 1x setelah 2s | "Coba lagi nanti" |

### Scrape Errors

| Skenario | Deteksi | Tindakan |
|----------|---------|----------|
| web_extract timeout | Response >15s → timeout | Fallback ke browser |
| web_extract 403/blocked | HTTP 403 atau empty body | Fallback ke browser |
| browser timeout | >30s | "Halaman terlalu lama" |
| browser vision gagal | Vision tidak bisa baca harga | "Halaman tidak bisa dibaca" |
| Harga tidak ditemukan | HTML parsed tapi 0 match | Coba source lain, atau minta user |
| Multiple prices (katalog) | >1 harga ditemukan | "Halaman katalog — pilih item spesifik" |

### Rate Limits

| Service | Limit | Mitigasi |
|---------|-------|----------|
| Telegram API | 20 msg/min per chat_id | Delay 200ms antar pesan |
| web_extract | ~30 req/min | Jeda 1s antar request |
| browser_* | ~10 req/min | Jeda 2s antar navigasi |
| Yahoo Auction | Unknown | Jeda 2s antar request |
| Mercari | Unknown — agresif block | Jeda 3s, pakai browser |
| Mayar API | Unknown | Jeda 1s antar request |

---

## Database Reference

```
SUPABASE_URL=https://gvbikxcnlmlcrbixwpxl.supabase.co

### Tables
profiles(id UUID PK, name TEXT, email TEXT, telegram_id BIGINT, telegram_token TEXT, role user_role, tier membership_tier, points_balance INT)
quotations(id UUID PK, user_id UUID FK, product TEXT, url TEXT, price_jpy INT, total INT, status quotation_status, expires_at TIMESTAMPTZ)
orders(id UUID PK, user_id UUID FK, product TEXT, total INT, status order_status, tracking_number TEXT, eta DATE, created_at TIMESTAMPTZ)
order_tracking(id UUID PK, order_id UUID FK, status order_status, note TEXT, occurred_at TIMESTAMPTZ)
wishlist_items(id UUID PK, user_id UUID FK, name TEXT, url TEXT, price_idr INT, source TEXT)
price_alerts(id UUID PK, user_id UUID FK, product TEXT, url TEXT, target_price INT, status alert_status)
payments(id UUID PK, order_id UUID FK, user_id UUID FK, method payment_method, amount INT, status payment_status, gateway_ref TEXT)
user_memberships(id UUID PK, user_id UUID FK UNIQUE, tier membership_tier, spent_amount BIGINT, target_amount BIGINT)
points_ledger(id UUID PK, user_id UUID FK, type points_type, amount INT, balance_after INT)
membership_plans(id UUID PK, name membership_tier UNIQUE, price_monthly INT, discount_percent DECIMAL, features JSONB)

### Views
user_orders_summary — orders with timeline_events + last_event
recent_order_updates — orders last 24h with telegram_id

### RPC Functions
rotate_telegram_token(p_user_id UUID) → TEXT — generate new token
link_telegram(p_user_id UUID, p_telegram_id BIGINT) → BOOLEAN — link akun

### Status → Emoji
draft📝 quote_created💰 waiting_payment⏳ paid✅ procurement_queue⏳
purchased🛍️ in_japan_warehouse🏭 packed📦 shipped_to_indonesia🚢
customs_clearance🏛️ last_mile_delivery🚚 delivered✅ cancelled❌ refunded💳
```

---

## Payment (Mayar)

```bash
# Create invoice
curl -s -X POST "https://api.mayar.id/hl/v1/invoice/create" \
  -H "Authorization: Bearer $MAYAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"PRODUK","amount":1500000,"customer":{"email":"user@email.com"}}'

# Check invoice status
curl -s -X GET "https://api.mayar.id/hl/v1/invoice/{id}" \
  -H "Authorization: Bearer $MAYAR_API_KEY"
```

**Payment flow:**
1. User setuju quotation
2. Bot create Mayar invoice via `create-invoice-mayar` skill
3. Bot kirim link bayar ke user
4. User bayar → Mayar webhook → Edge Function → update order status → notif ke Telegram

**Branding:** Gunakan "Zantara Pay" sebagai display name (bukan Mayar/QRIS)

---

## Command Reference

| Command | Trigger | Action |
|---------|---------|--------|
| /start | Teks | Welcome / link akun |
| /register | Teks | Register flow |
| /login | Teks | Login flow |
| /orders | Skill | Daftar pesanan |
| /order | Skill | Detail pesanan |
| /membership | Skill | Cek membership |
| /points | Skill | Cek poin |
| /wishlist | Skill | Wishlist |
| /beli | Skill | Cari + checkout |
| /help | Teks | Bantuan |
| /unlink | Skill | Putus akun |
| /reset | Teks | Reset percakapan |

**Rule:** Kalau user belum login (/register dulu), tampilkan welcome message dengan /register + /login.
**Rule:** Kalau sudah login, semua command di atas aktif.
```

---

### Task 2: SOUL.md — Tambah Error Classification Matrix

**Objective:** Tambah error classification matrix di SOUL.md supaya bot tahu cara handle tiap error.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

**Tambah di bawah "Response Style" section:**

```markdown
## Error Classification

### Supabase API Errors
| Kode | Penyebab | Tindakan Bot | Pesan ke User |
|------|----------|-------------|---------------|
| PGRST116 | Record tidak ditemukan | Jangan sebut error internal | "Tidak ditemukan" |
| PGRST202 | Fungsi/table tidak ada | Catat internal | "Fitur belum tersedia" |
| PGRST204 | Column name salah (snake_case?) | Log internal | "Coba lagi nanti" |
| PGRST301 | RLS blocked | Ganti header (service_role) | Internal only |
| 401 | API key invalid | Cek .env | Internal only |
| 404 | Endpoint salah | Cek URL | Internal only |
| 429 | Rate limit kena | Delay 5s, retry 1x | "Mohon tunggu sebentar" |
| 5xx | Server error Supabase | Retry 1x delay 2s | "Coba lagi nanti" |

### Scrape Errors
| Skenario | Deteksi | Fallback |
|----------|---------|----------|
| web_extract timeout | >15s | → browser |
| web_extract 403/blocked | Empty body | → browser |
| browser timeout | >30s | "Halaman terlalu lama" |
| browser_vision gagal baca | No price found | "Tidak bisa dibaca" |
| Harga gak ketemu | Parsed 0 matches | Coba source lain |
| Katalog page | Multiple items | "Pilih item spesifik" |
```

---

### Task 3: Script — `test-rpc.sh`

**Objective:** Script CLI untuk test semua RPC functions tanpa perlu chat bot.

**Files:**
- Create: `~/.hermes/profiles/mybagasi-ai/scripts/test-rpc.sh`

```bash
#!/bin/bash
# MyBagasi RPC Tester
# Usage: ./test-rpc.sh <function> [params...]
# Examples:
#   ./test-rpc.sh rotate_telegram_token '{"p_user_id":"<uuid>"}'
#   ./test-rpc.sh profiles '{"select":"id,name,telegram_id","limit":1}'

set -euo pipefail

# Load env
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

FUNCTION="${1:-}"
shift 2>/dev/null || true
PARAMS="${1:-}"

if [ -z "$FUNCTION" ]; then
    echo "❌ Usage: ./test-rpc.sh <function> [json_params]"
    echo ""
    echo "Available tests:"
    echo "  list-functions         — Show all available RPC functions"
    echo "  rotate_telegram_token  — Test token rotation"
    echo "  profiles               — Query profiles table"
    echo "  orders                 — Query orders"
    echo "  supabase               — Test Supabase connection"
    echo "  telegram               — Test Telegram connection"
    echo "  mayar                  — Test Mayar connection"
    exit 1
fi

BASE="$SUPABASE_URL/rest/v1"
HEADERS=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")

case "$FUNCTION" in
    list-functions)
        curl -s "$SUPABASE_URL/rest/v1/" | python3 -c "import json,sys; spec=json.load(sys.stdin); rpcs=[p for p in spec['paths'] if '/rpc/' in p]; print(f'Available RPCs ({len(rpcs)}):'); [print(f'  • {p.split(\"/rpc/\")[1]}') for p in sorted(rpcs)]"
        ;;

    rotate_telegram_token)
        echo "Testing rotate_telegram_token with params: $PARAMS"
        curl -s -X POST "$BASE/rpc/rotate_telegram_token" \
            "${HEADERS[@]}" \
            -d "$PARAMS" | python3 -m json.tool 2>/dev/null || cat
        ;;

    profiles)
        QUERY="${PARAMS:-{\"select\":\"id,name,email,telegram_id,telegram_token,tier,points_balance\",\"limit\":5}}"
        curl -s -X GET "$BASE/profiles" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -G --data-urlencode "select=id,name,email,telegram_id,telegram_token,tier,points_balance" \
            --data-urlencode "limit=5" | python3 -m json.tool 2>/dev/null || cat
        ;;

    orders)
        QUERY="${PARAMS:-{\"select\":\"id,user_id,product,total,status,tracking_number\",\"limit\":5}}"
        curl -s -X GET "$BASE/orders" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -G --data-urlencode "select=id,user_id,product,total,status,tracking_number" \
            --data-urlencode "order=created_at.desc" \
            --data-urlencode "limit=5" | python3 -m json.tool 2>/dev/null || cat
        ;;

    supabase)
        echo "Testing Supabase connection..."
        curl -s -o /dev/null -w "HTTP %{http_code} — %{time_total}s" "$BASE/profiles?select=count&limit=1" "${HEADERS[@]}"
        echo ""
        ;;

    telegram)
        echo "Testing Telegram connection..."
        curl -s -o /dev/null -w "HTTP %{http_code} — %{time_total}s" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
        echo ""
        ;;

    mayar)
        echo "Testing Mayar connection..."
        curl -s -o /dev/null -w "HTTP %{http_code} — %{time_total}s" "https://api.mayar.id/hl/v1/auth" \
            -H "Authorization: Bearer $MAYAR_API_KEY"
        echo ""
        ;;

    *)
        echo "❌ Unknown function: $FUNCTION"
        exit 1
        ;;
esac
```

**Verifikasi:**
```bash
chmod +x scripts/test-rpc.sh
./scripts/test-rpc.sh supabase         # → HTTP 200
./scripts/test-rpc.sh telegram         # → HTTP 200
./scripts/test-rpc.sh profiles         # → JSON profiles
./scripts/test-rpc.sh list-functions   # → Daftar RPC
```

---

## 🔥 Wave 2: Debug & Payment (P1 + P2)

### Task 4: Script — `debug-scrape.sh`

**Objective:** Script untuk debug scraping — test URL langsung tanpa lewat chat bot.

**Files:**
- Create: `~/.hermes/profiles/mybagasi-ai/scripts/debug-scrape.sh`

```bash
#!/bin/bash
# MyBagasi Scrape Debugger
# Usage: ./debug-scrape.sh <url>
# Tests: web_extract → browser → vision → fallback

set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
    echo "Usage: ./debug-scrape.sh <url>"
    echo ""
    echo "Example: ./debug-scrape.sh https://page.auctions.yahoo.co.jp/jp/auction/123456"
    echo "         ./debug-scrape.sh https://jp.mercari.com/item/abc123"
    exit 1
fi

echo "🔍 Testing scrape for: $URL"
echo ""

echo "1️⃣  Level 1: web_extract..."
echo "   → Try: web_extract([\"$URL\"])"
echo "   → Expect: Parse harga + judul dari response"
echo ""

echo "2️⃣  Level 2: browser (if Level 1 fails)..."
echo "   → Try: browser_navigate(\"$URL\") + browser_vision"
echo "   → Expect: Screenshot + vision baca harga"
echo ""

echo "3️⃣  Level 3: fallback search (if Level 2 fails)..."
echo "   → Extract keyword from URL"
echo "   → web_search with keyword"
echo ""

echo "4️⃣  Level 4: fail"
echo "   → 'Maaf, halaman ini tidak bisa dibaca'"
echo ""

echo "--- Marketplace Detection ---"
if [[ "$URL" == *"yahoo.co.jp"* ]]; then
    echo "🏪 Marketplace: Yahoo Auction"
    echo "   Pattern: span[class*='Price']"
    echo "   Rate limit: ~10 req/min"
elif [[ "$URL" == *"mercari.com"* ]]; then
    echo "🏪 Marketplace: Mercari"
    echo "   Pattern: span[data-testid='price']"
    echo "   User-Agent: Mozilla/5.0 required"
elif [[ "$URL" == *"rakuten.co.jp"* ]]; then
    echo "🏪 Marketplace: Rakuten"
    echo "   Pattern: span[class*='price']"
    echo "   web_extract usually sufficient"
elif [[ "$URL" == *"amazon.co.jp"* ]]; then
    echo "🏪 Marketplace: Amazon JP"
    echo "   Pattern: span[class*='a-price-whole']"
    echo "   browser required (Amazon blocks)"
else:
    echo "🏪 Marketplace: Unknown"
fi
echo ""
echo "--- Testing (via terminal) ---"
echo "Run this in terminal to test web_extract:"
echo "  web_extract([\"$URL\"])"
```

---

### Task 5: Script — `test-flow.sh`

**Objective:** End-to-end flow test — simulasi lengkap dari register sampai checkout.

**Files:**
- Create: `~/.hermes/profiles/mybagasi-ai/scripts/test-flow.sh`

```bash
#!/bin/bash
# MyBagasi Flow Tester — end-to-end simulation
# Usage: ./test-flow.sh [flow_name]
# Flows: register, login, search, scrape-order, checkout

set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

BASE="$SUPABASE_URL/rest/v1"
HEADERS=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")

FLOW="${1:-help}"

case "$FLOW" in
    register)
        echo "🧪 Test Flow: REGISTER"
        echo "1. Cek apakah Auth Admin API accessible..."
        curl -s -o /dev/null -w "   HTTP %{http_code}\n" -X POST "$SUPABASE_URL/auth/v1/admin/users" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d '{"email":"test@mybagasi.test","password":"test1234","email_confirm":true,"user_metadata":{"name":"Test User"}}' 2>/dev/null || echo "   ⚠️  Auth API might need admin access"
        
        echo "2. Cek trigger handle_new_user()..."
        echo "   → Creates profile + telegram_token automatically"
        echo ""
        echo "3. Cek rotate_telegram_token RPC..."
        USER_ID=$(curl -s "$BASE/profiles?select=id&limit=1" "${HEADERS[@]}" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data[0]['id'] if data else 'N/A')" 2>/dev/null)
        if [ "$USER_ID" != "N/A" ] && [ "$USER_ID" != "" ]; then
            echo "   User ID: $USER_ID"
            TOKEN=$(curl -s -X POST "$BASE/rpc/rotate_telegram_token" "${HEADERS[@]}" -d "{\"p_user_id\":\"$USER_ID\"}" 2>/dev/null | tr -d '"')
            echo "   Token: $TOKEN"
        fi
        ;;

    login)
        echo "🧪 Test Flow: LOGIN"
        echo "1. Cari profile by email..."
        echo "   curl -s \"$BASE/profiles?email=eq.{email}&select=id,telegram_id\""
        echo ""
        echo "2. Generate token..."
        echo "   curl -s -X POST \"$BASE/rpc/rotate_telegram_token\" -d '{\"p_user_id\":\"...\"}'"
        echo ""
        echo "3. Link telegram_id..."
        echo "   curl -s -X PATCH \"$BASE/profiles?id=eq.{id}\" -d '{\"telegram_id\": $CHAT_ID}'"
        ;;

    search)
        echo "🧪 Test Flow: SEARCH PRODUK"
        echo "→ Simulasi: User cari 'onitsuka tiger'"
        echo ""
        echo "1. web_search('onitsuka tiger site:jp.mercari.com')"
        echo "2. Ambil 3 hasil teratas"
        echo "3. Format: '1. Onitsuka Tiger Mexico 66 — ¥12,000 — Mercari'"
        ;;

    scrape-order)
        echo "🧪 Test Flow: SCRAPE + ORDER"
        echo "→ Simulasi: User kirim URL, scrape, buat quotation"
        echo ""
        echo "1. web_extract([URL])"
        echo "2. Parse harga: JPY X"
        echo "3. Hitung all-in: X * rate * (1 + fee% + tax%) + shipping"
        echo "4. INSERT quotation via curl"
        echo "5. User setuju → INSERT order"
        echo "6. Create Mayar invoice"
        ;;

    checkout)
        echo "🧪 Test Flow: CHECKOUT (end-to-end)"
        echo ""
        echo "1. Buat quotation..."
        echo "2. User /setujui..."
        echo "3. INSERT order..."
        echo "4. create-invoice-mayar skill..."
        echo "5. Kirim link bayar..."
        echo "6. Mayar webhook → update status..."
        echo "7. Notifikasi Telegram..."
        ;;

    all)
        echo "🧪 Running ALL FLOW TESTS..."
        echo ""
        bash "$0" register
        echo ""
        bash "$0" login
        echo ""
        bash "$0" search
        echo ""
        bash "$0" scrape-order
        echo ""
        bash "$0" checkout
        ;;

    *)
        echo "MyBagasi Flow Tester"
        echo "Usage: ./test-flow.sh [flow]"
        echo ""
        echo "Flows:"
        echo "  register      — Test register flow"
        echo "  login         — Test login flow"
        echo "  search        — Test search flow"
        echo "  scrape-order  — Test scrape + order flow"
        echo "  checkout      — Test checkout flow"
        echo "  all           — Test all flows"
        ;;
esac
```

---

### Task 6: SOUL.md — Tambah `/payment` Command

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

Tambah setelah `/unlink` section:

```markdown
### `/payment <order_id>` — Cek Status Pembayaran

**Flow:**
1. Query payments table by order_id
2. Tampilkan: metode, jumlah, status, gateway_ref

```bash
curl -s "$SUPABASE_URL/rest/v1/payments?order_id=eq.$ORDER_ID&select=method,amount,status,gateway_ref,created_at"
```

**Response:**
```
💳 *Status Pembayaran*

Order: ORD-001
Metode: QRIS
Jumlah: Rp1.582.000
Status: ✅ Lunas
Ref: MAYAR-12345
Tgl: 15 Jun 2026
```
```

---

## 🔥 Wave 3: Monitoring & Cleanup (P2 + P3)

### Task 7: Cron — Health Check

**Files:**
- Create cron job di profile `mybagasi-ai`

```bash
cronjob action=create \
  schedule="every 30m" \
  name="mybagasi-health-check" \
  profile="mybagasi-ai" \
  deliver="local" \
  prompt="Check if MyBagasi bot is healthy:
1. Test Supabase connection: curl -s -o /dev/null -w '%{http_code}' '$SUPABASE_URL/rest/v1/profiles?select=count&limit=1' -H 'apikey: $SUPABASE_SERVICE_ROLE_KEY'
2. Test Telegram API: curl -s -o /dev/null -w '%{http_code}' 'https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe'
3. If either fails → send alert to admin Telegram chat

Expected: Both return 200.
If not 200, send: '⚠️ MyBagasi Health Alert: Supabase/Telegram not responding'"
```

---

### Task 8: Cron — Data Cleanup

**Files:**
- Create cron job di profile `mybagasi-ai`

```bash
cronjob action=create \
  schedule="0 3 * * *" \
  name="mybagasi-data-cleanup" \
  profile="mybagasi-ai" \
  deliver="local" \
  prompt="Cleanup expired data from MyBagasi database:

1. Delete quotations WHERE status='expired' OR expires_at < NOW() - INTERVAL '7 days'
   curl -s -X DELETE '$SUPABASE_URL/rest/v1/quotations?or=(status.eq.expired,expires_at.lt.$(date -d '7 days ago' +%Y-%m-%d))'
   
2. Delete scraper_failures WHERE created_at < NOW() - INTERVAL '30 days'
   curl -s -X DELETE '$SUPABASE_URL/rest/v1/scraper_failures?created_at.lt.$(date -d '30 days ago' +%Y-%m-%d)'

3. Update expired price_alerts: SET status='triggered'
   curl -s -X PATCH '$SUPABASE_URL/rest/v1/price_alerts?status=eq.monitoring' \
     -d '{\"status\":\"expired\"}' \
     -H 'Prefer: return=minimal'

Report: X quotations deleted, Y scraper failures deleted, Z alerts expired.
Silent if all zero."
```

---

### Task 9: Script — `test-edge-function.sh`

**Objective:** Script untuk test Edge Function dari CLI.

**Files:**
- Create: `~/.hermes/profiles/mybagasi-ai/scripts/test-edge-function.sh`

```bash
#!/bin/bash
# Test Edge Function send-order-update
# Usage: ./test-edge-function.sh [payload_json]

set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

FUNCTION_URL="$SUPABASE_URL/functions/v1/send-order-update"
PAYLOAD="${1:-'{\"order_id\":\"test-123\",\"user_id\":\"test-user\",\"new_status\":\"paid\",\"product\":\"Test Product\",\"tracking_number\":\"JP123\"}'}"

echo "🚀 Testing Edge Function: send-order-update"
echo "URL: $FUNCTION_URL"
echo "Payload: $PAYLOAD"
echo ""

curl -s -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -m json.tool 2>/dev/null || cat
```

---

## ⚠️ Pitfalls

1. **AGENTS.md vs SOUL.md** — AGENTS.md untuk workflow teknis (step-by-step, curl commands), SOUL.md untuk persona + response format. Jangan campur aduk.

2. **Script path resolution** — `test-rpc.sh`, `debug-scrape.sh` dll di `scripts/` — pastikan `chmod +x` dan path `.env` benar.

3. **Error message konsistensi** — Semua pesan error ke user harus dari SOUL.md error classification, bukan dari kode internal.

4. **Jangan expose secret di script** — Script baca dari `.env`, jangan hardcode API key.

5. **Cron silent** — Health check dan data cleanup cron pakai `deliver=local` (silent). Jangan kirim notifikasi ke user.

6. **AGENTS.md update** — Setiap kali tambah marketplace atau workflow baru, update AGENTS.md. Jadikan kebiasaan.

---

## ✅ Verifikasi

| Step | Test | Command |
|------|------|---------|
| AGENTS.md | Baca format + completeness | `wc -l AGENTS.md` — target >200 baris |
| Error classification | Ada di SOUL.md | `grep "Error Classification" SOUL.md` |
| test-rpc.sh | Test Supabase | `./scripts/test-rpc.sh supabase` → HTTP 200 |
| test-rpc.sh | Test Telegram | `./scripts/test-rpc.sh telegram` → HTTP 200 |
| test-rpc.sh | List functions | `./scripts/test-rpc.sh list-functions` |
| debug-scrape.sh | Syntax valid | `bash -n scripts/debug-scrape.sh` |
| test-flow.sh | All flows | `./scripts/test-flow.sh all` |
| Health check cron | Created | `cronjob action=list` |
| Data cleanup cron | Created | `cronjob action=list` |
```
