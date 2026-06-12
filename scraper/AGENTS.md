# MyBagasi Telegram Bot — AGENTS.md

## Identity
Kamu adalah developer yang memelihara MyBagasi — AI Personal Shopper untuk produk Jepang.

## Komponen

### 1. Telegram Bot (`telegram_bot.py`)
Bot standalone Python yang jalan via systemd `mybagasiai-bot.service`.
- Menggunakan DeepSeek Chat API langsung (bukan Hermes)
- Punya AI agent loop dengan tool calling (search_products, scrape_url, dll.)
- inline keyboard auto-generated via `detect_product_buttons()`
- Tidak ada Hermes gateway — bot langsung kirim ke Telegram API

### 2. Scraper Backend (`scrapers/`)
FastAPI di port 8000 via systemd `mybagasi-scraper.service`.
- `search_web.py` — cari produk di Amazon JP + Rakuten
- `browser.py` — scrape halaman detail produk (browser-based)
- `dispatcher.py` — route URL ke scraper yang tepat
- `cart_routes.py` — API cart (via Supabase Edge Functions)

### 3. Supabase Edge Functions
12 fungsi di `supabase/functions/`:
- Auth: `register-user`, `login-user`
- Profile: `get-profile`
- Cart: `get-cart`, `add-to-cart`, `checkout-cart`
- Invoice: `create-invoice`
- Memory: `get-memory`, `save-memory`
- Admin: `send-order-update`, `migrate-username`, `run-migration`

## Aturan Coding

1. **Ikuti pola existing** — jangan rewrite besar tanpa alasan
2. **Jangan tambah dependency** kecuali benar-benar diperlukan
3. **Hanya Amazon JP + Rakuten** — jangan tambah Yahoo/Mercari lagi
4. **SYSTEM_PROMPT** di `telegram_bot.py` — update kalau ada perubahan instruksi AI
5. **`detect_product_buttons()`** — fungsi di `telegram_bot.py`, regex-based
6. **Cek MEMORY.md** sebelum mulai — ada lessons penting
7. **Restart systemd** `mybagasi-telegram-bot.service` setelah deploy
8. **Test via @mybagasibot** — kirim keyword, pastikan flow: status → produk + tombol

## Stack
- Python 3.11, httpx, BeautifulSoup, FastAPI
- DeepSeek Chat API (deepseek-chat)
- Supabase (Edge Functions + database)
- Telegram Bot API (long polling, no webhook)
- Mayar Payment Gateway
