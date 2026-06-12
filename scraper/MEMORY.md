# MyBagasi Scraper — Persistent Memory & Lessons

## Key Facts

### Architecture
- **Bot:** systemd `mybagasiai-bot.service` (Python standalone, NOT Hermes gateway)
- **Scraper API:** systemd `mybagasi-scraper.service` (FastAPI, port 8000)
- **Admin Bot:** systemd `mybagasi-adminbot.service`
- **LLM:** DeepSeek Chat (`deepseek-chat`) via `api.deepseek.com`
- **Search:** Amazon JP + Rakuten ONLY (no Yahoo, no Mercari)
- **Database:** Supabase `gvbikxcnlmlcrbixwpxl` (dual-schema: public + pos)
- **Payment:** Mayar Headless API via Supabase Edge Function

### Critical Lessons

1. **Bot response format:** Jangan gunakan ---KEYBOARD--- marker — sistem auto-detect produk via `detect_product_buttons()` dari pola `N — Nama`. AI cukup format produk dengan nomor `N — `.

2. **Hanya harga retail/resmi:** Jangan tampilkan harga second/thrift. Hanya produk baru dari Amazon JP, Rakuten, atau toko official.

3. **Status progres:** Kirim "⏳ *Memproses...*" langsung, lalu "🔍 *Mencari produk...* ⏳" dengan timer (update tiap 3 detik). Hanya 1 status — tidak boleh duplikat.

4. **1 pesan, banyak tombol:** Semua produk dalam 1 chat dengan inline keyboard berisi tombol per produk. Jangan kirim per produk terpisah.

5. **Inline keyboard:** `detect_product_buttons()` auto-generate dari teks AI. Callback `cart_N` per produk. Tombol `cart_skip` di baris terakhir.

6. **Foto:** Hanya foto produk pertama yang dikirim (jika ada). Jika gagal, fallback ke teks + tombol.

7. **Error handling:** Jangan tampilkan detail teknis ke user. Cukup "Maaf, lagi error. Coba lagi nanti."

### File Locations
| Path | Purpose |
|------|---------|
| `/opt/mybagasi/scraper/telegram_bot.py` | Main bot code |
| `/opt/mybagasi/scraper/scrapers/` | Scraper modules |
| `/opt/mybagasi/scraper/scrapers/search_web.py` | Web search logic |
| `/opt/mybagasi/scraper/scrapers/browser.py` | Browser-based scraping |
| `/opt/mybagasi/scraper/data/` | Cached data (images, orders) |
| `/opt/mybagasi/scraper/.env` | Environment variables |

### Rate Limits & Timeouts
- `_rate_limit_window = 0.5` (per domain)
- Cache: 180 seconds
- Markeplace search timeout: 12s per site
- Scrape timeout: 6s (HTTP), 15s (full)
- Concurrent scrapes: 4 (semaphore)
