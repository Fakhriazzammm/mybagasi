# MyBagasi Scraper — Project Context

## 🏗️ Stack

| Layer | Teknologi | Lokasi |
|-------|-----------|--------|
| **Bot** | Python standalone (systemd) | `/opt/mybagasi/scraper/telegram_bot.py` |
| **AI Model** | DeepSeek Chat (`deepseek-chat`) | via `api.deepseek.com` |
| **Scraper API** | FastAPI (Python) on port 8000 | `/opt/mybagasi/scraper/scrapers/` |
| **Database** | Supabase `gvbikxcnlmlcrbixwpxl` | Cloud |
| **Payment** | Mayar Headless API (via Supabase EF) | Supabase Edge Functions |
| **Search** | Amazon JP + Rakuten (langsung scrape) | `search_web.py` |
| **Bot** | Telegram @mybagasibot | systemd long polling |
| **Admin Bot** | @mybagasiadminbot | systemd long polling |

## 🔗 Architecture

```
User (Telegram)
    │
    ▼
telegram_bot.py (systemd: mybagasiai-bot.service)
    │  ┌──────────────────────────────┐
    │  │ LLM: DeepSeek Chat API       │
    │  │ detect_product_buttons()     │
    │  │ ai_process() loop (5 turns)  │
    │  └──────────────────────────────┘
    │
    ├──► FastAPI Scraper (port 8000)
    │     ├── /search   → Amazon JP + Rakuten
    │     └── /scrape   → product detail
    │
    └──► Supabase Edge Functions:
          ├── register-user, login-user
          ├── get-profile
          ├── get-cart, add-to-cart, checkout-cart
          ├── create-invoice
          └── get-memory, save-memory
```

## 📂 Struktur File

```
/opt/mybagasi/scraper/
├── telegram_bot.py           # Main bot (systemd)
├── AGENTS.md                 # Panduan AI agent
├── MEMORY.md                 # Lessons & facts
├── TOOLS.md                  # Tool usage
├── SKILL.md                  # Reusable procedures
├── PROJECT.md                # File ini
├── scrapers/
│   ├── __init__.py
│   ├── dispatcher.py         # URL → scraper router
│   ├── search_web.py         # Search Amazon + Rakuten
│   ├── browser.py            # Browser-based scraping
│   ├── yahoo_auction.py      # Yahoo scraper (legacy)
│   ├── llm_extract.py        # LLM fallback extraction
│   ├── cart_routes.py        # Cart API routes
│   └── models.py             # ProductData model
├── data/
│   ├── images/               # Cached product images
│   ├── orders.json           # Order persistence
│   └── bills.json            # Bill persistence
├── .env                      # Environment variables
└── .venv/                    # Python virtual env
```

## 🔐 Environment Variables

| Variable | Untuk |
|----------|-------|
| `DEEPSEEK_API_KEY` | DeepSeek Chat API |
| `TELEGRAM_BOT_TOKEN` | @mybagasibot token |
| `ADMIN_BOT_TOKEN` | @mybagasiadminbot token |
| `ADMIN_GROUP_ID` | Admin notification group |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin operations |
| `MAYAR_API_KEY` | Mayar payment gateway |

## 🔄 Systemd Services

| Service | PID | Fungsi |
|---------|-----|--------|
| `mybagasi-telegram-bot.service` | ~varies | Bot utama @mybagasibot |
| `mybagasi-scraper.service` | ~varies | FastAPI scraper backend |
| `mybagasi-adminbot.service` | ~varies | Admin bot @mybagasiadminbot |

## 🗄️ Supabase Tables

| Table | RLS | Kegunaan |
|-------|-----|----------|
| `profiles` | `auth.uid() = id` | User profile (name, email, tier) |
| `cart_items` | `auth.uid() = user_id` | Shopping cart |
| `orders` | `auth.uid() = user_id` | Orders history |
| `quotations` | `auth.uid() = user_id` | Saved price quotes |

## ⚠️ Critical Rules

1. **Hanya Amazon JP + Rakuten** — JANGAN scrap Yahoo Auction, Mercari, PayPay
2. **Hanya produk BARU original** — BUKAN second/thrift
3. **1 chat, banyak tombol** — jangan kirim per produk terpisah
4. **Foto hanya produk pertama** — hemat bandwidth
5. **Tidak ada keyboard marker** — `detect_product_buttons()` auto-detect
6. **Status progres 1x** — dengan timer countdown
7. **Error: tampilan publik** — jangan cerita detail teknis

## Deployment

```bash
# Push code
git add . && git commit -m "desc" && git push

# Deploy Edge Functions
cd /opt/mybagasi
supabase functions deploy <name>

# Restart services
sudo systemctl restart mybagasi-telegram-bot.service
sudo systemctl restart mybagasi-scraper.service
```
