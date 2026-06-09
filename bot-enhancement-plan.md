# Bot Enhancement Plan — Fase 1: Data per User

## Tujuan
Setiap interaksi user dengan @mybagasibot (search, scrape, quote, beli) harus tersimpan di Supabase, sehingga muncul di dashboard user masing-masing di mybagasi.my.id.

## Apa yang Berubah

### 1. Bot → Simpan Quotation ke Supabase
Setelah tool `search_products` atau `scrape_product` selesai:
- Parse hasil dari tool (nama produk, harga JPY, marketplace, URL)
- INSERT ke `quotations` table dengan `user_id` dari linked user
- `source` diisi `'telegram_bot'`
- Simpan `quotation_id` di conversation state

### 2. Bot → Simpan Order ke Supabase
Saat user konfirmasi beli dan AI panggil tool `create_payment`:
- Sebelum/bersamaan dengan create_payment, INSERT ke `orders` table
- `user_id`, `product`, `price_jpy`, `total`, dll dari konteks quote
- `source = 'telegram_bot'`
- Simpan `order_id` di conversation state

### 3. Bot → Simpan Wishlist
- Tool baru / tombol simpan wishlist
- INSERT ke `wishlist_items` table

### 4. Dashboard — Filter per User
- Semua halaman dashboard sudah pakai `user_id` dari `useAuth()` → otomatis
- Hanya pastikan quotations, orders, wishlist dari bot punya `user_id` yang bener

## File yang Diubah
- `/opt/mybagasi/scraper/telegram_bot.py` — tambah fungsi save_quotation, save_order, save_wishlist

## Testing
1. Chat bot → cari produk
2. Cek DB: `SELECT * FROM quotations WHERE source = 'telegram_bot'`
3. Login web → dashboard quotations → lihat data dari bot
