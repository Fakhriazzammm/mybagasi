# MyBagasi Bot — Core Skills

## 1. Fix Bot Response Flow

**Trigger:** Bot tidak merespon atau 409 Conflict

**Steps:**
1. `journalctl -u mybagasi-telegram-bot.service -n 20` — cek log error
2. Jika 409 Conflict → cek apakah ada 2 instance polling token yang sama
3. `systemctl status mybagasi-telegram-bot.service` — cek PID
4. `ps aux | grep <token>` — cari instance lain
5. Kill instance ganda → restart `mybagasi-telegram-bot.service`

## 2. Update SYSTEM_PROMPT

**Trigger:** Perubahan instruksi AI

**Steps:**
1. Cari `SYSTEM_PROMPT = """` di `telegram_bot.py`
2. Edit sesuai kebutuhan
3. Restart systemd service

## 3. Deploy Bot Changes

**Trigger:** Setelah edit kode bot

**Steps:**
1. `sudo systemctl restart mybagasi-telegram-bot.service`
2. `sleep 2 && sudo systemctl status mybagasi-telegram-bot.service` — verifikasi running
3. Test kirim keyword ke @mybagasibot
4. Cek `journalctl -u mybagasi-telegram-bot.service -n 10` untuk pastikan no error

## 4. Remove Yahoo from Search Results

**Trigger:** Bot masih nampilin Yahoo Auction

**Steps:**
1. Edit `scrapers/search_web.py`:
   - Hapus Yahoo/Mercari dari `SEARCH_DOMAINS`
   - Hapus Yahoo/Mercari dari `MARKETPLACE_SEARCH_URLS`
   - Hapus Yahoo patterns dari `_extract_ecommerce_links_from_html`
2. Edit `telegram_bot.py`:
   - Update SYSTEM_PROMPT — larang Yahoo
   - Update tool descriptions — hapus Yahoo
3. Restart scraper + bot: `mybagasi-scraper.service` + `mybagasi-telegram-bot.service`
