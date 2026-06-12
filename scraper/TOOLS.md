# MyBagasi Scraper — TOOLS.md

## Tools & Usage

### File Management
- `read_file(path)` — baca file dengan line numbers
- `patch(path, old, new)` — edit targeted (ganti string)
- `write_file(path, content)` — tulis file baru/overwrite
- `search_files(pattern, path)` — cari teks dalam file

### Terminal
- `sudo systemctl restart mybagasi-telegram-bot.service` — restart bot
- `sudo systemctl status mybagasi-telegram-bot.service` — cek status
- `journalctl -u mybagasi-telegram-bot.service -n 50 --no-pager` — log
- `sudo systemctl restart mybagasi-scraper.service` — restart scraper API

### Git
- `git add . && git commit -m "..." && git push` — deploy commit
- Branch: `main` (production)

### Supabase
- `supabase functions deploy <name>` — deploy edge function
- `supabase db push` — run migrations
- Query via `SUPABASE_URL` + anon key

### Testing
- Kirim keyword ke @mybagasibot di Telegram
- Cek console log: `journalctl -u mybagasi-telegram-bot.service -f`
- API health: `curl http://localhost:8000/health`

## Scraper API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/scrape` | POST | Scrape product URL |
| `/search` | POST | Search products by keyword |
| `/mayar/*` | POST | Mayar payment routes |
