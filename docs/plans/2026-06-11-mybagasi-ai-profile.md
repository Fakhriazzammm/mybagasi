# 🏗️ MyBagasi AI — Full Hermes Profile Plan

> **Goal:** Ganti 3 service existing (Telegram Bot + Scraper API + AI Agent) dengan 1 Hermes Agent profile.
>
> **Profile Name:** `mybagasi-ai`
> **Model:** DeepSeek v4 Flash (via 9router atau DeepSeek langsung)

---

## 1. Arsitektur: Sekarang → Nanti

### 🏛️ Sekarang (3 service)

```
telegram_bot.py (Python, 1500 baris)
  ├── Scraper API (FastAPI, localhost:8000)
  │   ├── scraper/dispatcher.py
  │   ├── scraper/mercari.py, amazon_jp.py, ...
  │   ├── scraper/browser.py (Playwright)
  │   └── scraper/vision_extract.py
  ├── DeepSeek AI (via API call)
  └── Supabase (DB + Auth)
```

Masalah:
- 2000+ baris Python untuk maintain
- Playwright version mismatch
- Scraper error handling manual
- Multi-step registrasi/login rumit
- Tidak ada cron/price tracker built-in

### 🆕 Nanti (1 Hermes profile)

```
Hermes Profile: mybagasi-ai
  ├── gateway: Telegram ← handle semua message
  ├── SOUL.md ← persona + prinsip
  ├── AGENTS.md ← workflow teknis
  ├── skills/
  │   ├── search-marketplace    — cari produk via web_search
  │   ├── scrape-product        — scrape + preview gambar
  │   ├── estimate-price        — hitung all-in + save ke Supabase
  │   ├── create-invoice-mayar  — buat invoice pembayaran
  │   ├── user-register         — daftar akun via Supabase Admin API
  │   ├── user-login            — login + link Telegram
  │   ├── user-wishlist         — CRUD wishlist
  │   └── price-tracker         — cron job monitor harga
  ├── cron/
  │   └── check-prices          — tiap 6 jam
  └── config.yaml               — restricted tools (browser, web, dll)
```

---

## 2. Tahap Implementasi

### 🟢 Tahap 1: Foundation (Profil + Gateway)

| Task | Estimasi |
|------|----------|
| 1.1 Create profile `mybagasi-ai` | 5 menit |
| 1.2 Setup config.yaml (model, tools, env) | 10 menit |
| 1.3 Setup .env (Telegram token, Supabase, 9router) | 5 menit |
| 1.4 Setup Telegram gateway (test koneksi) | 10 menit |
| 1.5 Test: kirim pesan ke bot → Hermes jawab | 10 menit |

**Output:** @mybagasibot aktif via Hermes, bisa chat basic.

### 🟡 Tahap 2: Skills Core (Fitur Utama)

| Task | Estimasi | Files |
|------|----------|-------|
| 2.1 Skill: `search-product` — cari di marketplace via web_search | 30 menit | `skills/search-product/SKILL.md` |
| 2.2 Skill: `scrape-product` — scrape URL + browser + vision fallback | 30 menit | `skills/scrape-product/SKILL.md` |
| 2.3 Skill: `estimate-price` — hitung all-in (fee, ongkir, pajak) + save quotation | 20 menit | `skills/estimate-price/SKILL.md` |
| 2.4 Skill: `create-invoice-mayar` — buat invoice via Mayar API | 20 menit | `skills/create-invoice-mayar/SKILL.md` |
| 2.5 SOUL.md — persona MyBagasi AI | 15 menit | `SOUL.md` |
| 2.6 AGENTS.md — workflow, data model, konvensi | 15 menit | `AGENTS.md` |

**Output:** Bot bisa cari produk, scrape URL, kasih estimasi harga, buat invoice.

### 🟠 Tahap 3: Auth + User Management

| Task | Estimasi | Files |
|------|----------|-------|
| 3.1 Skill: `user-register` — daftar via Supabase Admin API | 20 menit | `skills/user-register/SKILL.md` |
| 3.2 Skill: `user-login` — login + link Telegram | 15 menit | `skills/user-login/SKILL.md` |
| 3.3 Skill: `user-wishlist` — CRUD wishlist + price alert | 20 menit | `skills/user-wishlist/SKILL.md` |
| 3.4 Supabase RPC: `rotate_telegram_token`, `get_profile` | 10 menit | SQL migration |

**Output:** User bisa daftar/login dari bot, simpan wishlist, buat price alert.

### 🔴 Tahap 4: Cron + Monitoring

| Task | Estimasi |
|------|----------|
| 4.1 Cron: `check-prices` — tiap 6 jam cek price_alerts | 20 menit |
| 4.2 Monitoring: log session, error tracking | 10 menit |
| 4.3 Test end-to-end: semua flow | 30 menit |

**Output:** Price tracker otomatis, notifikasi harga turun.

### ⚫ Tahap 5: Migrasi & Decommission

| Task | Estimasi |
|------|----------|
| 5.1 Backup existing user data (confirmed working) | 10 menit |
| 5.2 Test paralel: old bot + new Hermes bersamaan | 20 menit |
| 5.3 Cutover: stop old bot, activekan Hermes di webhook | 5 menit |
| 5.4 Verify all features work via Hermes | 30 menit |
| 5.5 Hapus old systemd services | 5 menit |

**Output:** Old bot mati, Hermes profile production live.

---

## 3. Detail Teknis Per Skill

### 3.1 `search-marketplace`

**Trigger:** User kirim keyword (bukan link, bukan command)

**Toolflow:**
```
web_search("site:mercari.com OR site:rakuten.co.jp OR site:amazon.co.jp <keyword>")
  → extract + format → tampilkan 5 hasil terbaik
  → user klik salah satu → scrape-product skill
```

**Pitfall:** 
- Search results bisa campur aduk. Gunakan `web_extract` untuk ambil harga dari halaman hasil
- Rate limit Google/Bing: pakai 2-3 query dengan domain berbeda, bukan 1 query besar

### 3.2 `scrape-product`

**Trigger:** User kirim URL marketplace / pilih hasil search

**Toolflow:**
```
URL masuk
  ├── web_extract(url) ← coba dulu (cepat, gratis)
  │   ✅ Punya title + price? → return + preview gambar
  │   ❌ Parsing error / blocked?
  │     └── browser_navigate(url) + browser_vision()
  │         ✅ Ada data? → extract + return
  │         ❌ Masih gagal? → "Maaf, halaman ini tidak bisa dibaca"
  └── vision_analyze(screenshot) → extract text dari screenshot
```

### 3.3 `estimate-price`

**Trigger:** Setelah scrape berhasil (auto-run, tanpa user minta)

**Logic:**
```
price_jpy × 105 (JPY→IDR)
+ fee 15%
+ shipping Rp250.000
+ tax 8%

→ Save ke tabel quotations via Supabase REST API
→ Tampilkan breakdown ke user
```

**Tool:** `terminal(curl ...)` ke Supabase REST API (bukan skill, langsung curl)

### 3.4 `create-invoice-mayar`

**Trigger:** User konfirmasi beli → minta nama, email, no HP

**Toolflow:**
```
terminal(curl -X POST https://api.mayar.id/...)
  → Dapat invoice_url
  → Save order ke Supabase
  → Kirim link pembayaran ke user
```

### 3.5 `user-register` / `user-login`

**Toolflow:**
```
Register:
  User kirim nama → email → password
  → terminal(curl) ke Supabase Auth Admin API
  → Profile auto-created by trigger
  → Kirim telegram_token ke user
  → User verify token → Telegram linked

Login:
  User kirim email
  → terminal(curl) ke rpc/rotate_telegram_token
  → Token baru dikirim ke user
  → User verify → Telegram linked
```

### 3.6 `user-wishlist`

**Toolflow:**
```
Save: "simpen ini" → terminal(curl) POST wishlist_items
View: "/wishlist" → terminal(curl) GET wishlist_items
Alert: "pantau harga ini" → terminal(curl) POST price_alerts
```

---

## 4. Konfigurasi Profile

### `~/.hermes/profiles/mybagasi-ai/config.yaml`

```yaml
model:
  provider: deepseek   # atau openrouter / 9router
  default: deepseek-chat
  base_url: https://api.deepseek.com/v1   # atau 9router

agent:
  max_turns: 30
  tool_use_enforcement: true

toolsets:
  enabled:
    - web        # web_search + web_extract
    - browser    # browser_navigate + browser_vision
    - terminal   # curl untuk Supabase + Mayar
    - vision     # vision_analyze untuk screenshot
    - skills     # load skill files
    - cronjob    # price tracker schedule
    - memory     # remember user preferences
    - session_search  # recall past conversations
    - clarify   # ask user questions
    - messaging # send messages across platforms
    - todo      # task management

  disabled:
    - file        # tidak perlu akses file system
    - code_execution  # tidak perlu execute Python
    - delegation  # tidak perlu subagent
    - image_gen   # tidak perlu generate gambar
    - tts         # tidak perlu text-to-speech
    - homeassistant  # tidak relevan
```

### `.env`

```env
# ⊗ Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_USERS=...

# ⊗ Model Provider (DeepSeek / 9router)
DEEPSEEK_API_KEY=...
# atau
OPENROUTER_API_KEY=...
# atau 9router
CUSTOM_PROVIDER_9ROUTER_API_KEY=...

# ⊗ Supabase (admin access untuk registrasi + data)
SUPABASE_URL=https://gvbikxcnlmlcrbixwpxl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# ⊗ Mayar Payment
MAYAR_API_KEY=...
MAYAR_TOKEN=...

# ⊗ Payment branding
PAYMENT_BRAND=Zantara Pay
```

---

## 5. SOUL.md — Persona MyBagasi AI

```markdown
# MyBagasi AI — Personal Shopper Jepang

## Identitas
Kamu adalah MyBagasi AI, asisten belanja pribadi untuk produk Jepang.
Tugasmu membantu pelanggan Indonesia membeli dari Mercari, Rakuten, Amazon JP, Yahoo Auction.

## Tools & Kemampuan

### ✅ Diizinkan
- web_search — cari produk di marketplace Jepang
- web_extract — baca halaman produk
- browser_navigate + browser_vision — lihat halaman JS-rendered
- terminal — curl ke Supabase REST API + Mayar API
- memory — ingat preferensi user

### ❌ Terlarang
- JANGAN akses filesystem di luar skill/supabase keperluan
- JANGAN execute kode Python/JS
- JANGAN expose API key, token, atau credential
- JANGAN ubah konfigurasi sistem

## Format Respon
📍 *Nama Produk*
💰 Harga: ¥X (Rp Y)
🏪 Marketplace

Estimasi All-in:
• Harga: Rp X
• Fee 15%: Rp Y
• Ongkir: Rp 250.000
• Pajak: Rp Z
• **Total: Rp W**

## Konversi & Pricing
- 1 JPY = Rp 105
- Fee jasa: 15% dari harga produk (IDR)
- Ongkir Jepang → Indonesia: Rp 250.000
- Pajak & bea cukai: 8% dari (harga + fee)
- Pembayaran: Zantara Pay
```

---

## 6. Data Migration

Data yang **tetap** di Supabase (tidak perlu migrasi):

| Table | Status |
|-------|--------|
| `profiles` | ✅ Existing — Hermes akses via curl |
| `quotations` | ✅ Existing — Hermes INSERT |
| `orders` | ✅ Existing — Hermes INSERT |
| `wishlist_items` | ✅ Existing — Hermes CRUD |
| `price_alerts` | ✅ Existing — Hermes CRUD + cron |
| `scrape_jobs` | 🗑️ Bisa dihapus (tidak dipakai Hermes) |

Data yang **dibuang** dari old bot:
- `telegram_bot.py` — tidak dipakai lagi
- `scraper/` — tidak dipakai lagi (Hermes punya tools sendiri)
- `main.py` (FastAPI) — tidak dipakai lagi
- `conversations` dict (in-memory) — Hermes handle session otomatis

---

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| **Browser memory leak** | Hermes crash | Set `browser.max_pages` + restart gateway periodic |
| **Latency web_search** | Response lambat | Optimasi query, cache hasil |
| **Supabase rate limit** | Gagal registrasi/order | Retry logic + queue |
| **Mayar API down** | Gagal checkout | Error handling + simpan pending order |
| **Token cost** | Lebih mahal dari existing | Monitor usage, batasi max_tokens |
| **User kebingungan** | Transisi tidak mulus | Periode paralel 1 minggu |

---

## 8. Timeline

| Tahap | Target | Duration |
|-------|--------|----------|
| 🟢 Foundation (profil + gateway) | Hari 1 | 1 jam |
| 🟡 Core skills (search, scrape, price, invoice) | Hari 1-2 | 3 jam |
| 🟠 Auth + user management (register, login, wishlist) | Hari 2 | 2 jam |
| 🔴 Cron + monitoring (price tracker) | Hari 2-3 | 1 jam |
| ⚫ Migrasi & decommission | Hari 3 | 2 jam |
| **Total** | **3 hari** | **~9 jam kerja** |

---

## 9. Verifikasi

Setiap tahap selesai, test:

| Test | Cara |
|------|------|
| Bot bisa chat | Kirim `/start` → dapat welcome |
| Search produk | Kirim "onitsuka tiger" → dapat 5 hasil |
| Scrape URL | Kirim link Mercari → dapat detail + gambar |
| Estimasi harga | Auto tampil setelah scrape |
| Wishlist | "simpen ini" → `/wishlist` → muncul |
| Login/Register | `/register` → daftar → verify |
| Price alert | "pantau ini 500000" → cron aktif |
| Invoice | "beli ini" → nama/email/HP → link bayar |
