# API Discovery — Official Sites Japan

Ditemukan via probing pada 11 Juni 2026.
Simpan agar tidak perlu probe ulang tiap sesi.

## Status Akses per Situs

| Situs | Direct (curl) | web_extract | Playwright | Catatan |
|-------|---------------|-------------|------------|---------|
| **uniqlo.com/jp** | ✅ SSR HTML | ✅ Works | ✅ | Data di `window.__PRELOADED_STATE__` |
| **nike.com/jp** | ✅ HTML biasa | ✅ Works | ✅ | HTML friendly, web_extract cukup |
| **rakuten.co.jp** | ✅ HTML biasa | ✅ Works | ✅ | Scraper sudah ada |
| **amazon.co.jp** | ⚠️ Sebagian | ⚠️ Sebagian | ✅ | Anti-scrape ringan |
| **adidas.jp** | ❌ 403 Akamai | ❌ | ⚠️ Mungkin tembus | Fully blocked by Akamai CDN |
| **ysl.com/ja-jp** | ❌ 403 Akamai | ❌ | ⚠️ Mungkin tembus | Akamai CDN |
| **gu-global.com/jp** | ❓ Belum dicek | ❓ | ❓ | Fast Retailing group (seperti Uniqlo) |
| **mercari.jp** | ⚠️ JS-heavy | ❌ | ✅ | Scraper sudah ada |
| **yahoo.co.jp** (auction) | ✅ | ⚠️ Sebagian | ✅ | Scraper sudah ada |

---

## Uniqlo (/jp)

**Base URL:** `https://www.uniqlo.com/jp`

**Metode:** SSR SPA — data ada di HTML, bukan API endpoint terpisah.

### Cara Akses

```
1. Fetch halaman: web_extract("https://www.uniqlo.com/jp/ja/products/G462479-000")
   → Dapat SSR HTML dengan <script> berisi window.__PRELOADED_STATE__

2. Extract data dari HTML:
   - Cari regex: window\.__PRELOADED_STATE__\s*=\s*({.*?});
   - Parse JSON → cari key "productData" atau "products"
```

### Product URL Pattern

```
https://www.uniqlo.com/jp/ja/products/<productId>-<colorId>
Contoh: https://www.uniqlo.com/jp/ja/products/G462479-000
```

### Search URL (SSR)

```
https://www.uniqlo.com/jp/ja/search?q=<keyword>
```

### Catatan
- Tidak ada pure JSON API yang accessible tanpa browser
- Queue-It kadang aktif (waiting room) — cukup refresh
- Image base URL: `https://image.uniqlo.com/`
- Asset CDN: `https://asset.uniqlo.com/`
- Cek juga: `gu-global.com/jp` (GU, same company, similar structure)

---

## Nike (/jp)

**Base URL:** `https://www.nike.com/jp`

**Metode:** HTML biasa, langsung accessible via web_extract.

### Cara Akses

```
web_extract("https://www.nike.com/jp/w?q=<keyword>")
→ Dapat full page content dengan harga produk
```

### Product URL Pattern

```
https://www.nike.com/jp/t/<product-name>/<productId>
Contoh: https://www.nike.com/jp/t/air-force-1-07-shoes-WFh3f5/AR7714-102
```

### Search URL

```
https://www.nike.com/jp/w?q=<keyword>
```

### Catatan
- Reliable, anti-scrape minimal
- Bisa pakai web_extract langsung
- API internal Nike belum ditemukan endpoint publik

---

## Rakuten

**Base URL:** `https://item.rakuten.co.jp`

**Metode:** HTML biasa. Scraper sudah ada di `scraper/scrapers/rakuten.py`.

### Cara Akses

```
web_extract("https://search.rakuten.co.jp/search/mall/<keyword>/")
```

### Product URL Pattern

```
https://item.rakuten.co.jp/<shop>/<itemId>/
```

### Catatan
- HTML friendly, scraper sudah jalan dengan httpx + BeautifulSoup

---

## Adidas (/jp)

**Status:** ❌ Fully blocked — Akamai CDN dengan Bot Manager.

### Yang Tidak Bisa
- curl ke endpoint apapun → 403
- web_extract → gagal
- API endpoints yang dicoba: `/api/products/search`, `/api/graphql`, Demandware endpoints → semua 403

### Satu-satunya Harapan
- Playwright browser dengan fingerprint real (bukan headless)
- Atau cari dari aggregator (Rakuten, Amazon Japan, Yahoo Shopping)
- Atau cari dari StockX / GOAT (untuk sneakers limited)

---

## Amazon Japan

**Base URL:** `https://www.amazon.co.jp`

### Product URL Pattern

```
https://www.amazon.co.jp/dp/<ASIN>
Contoh: https://www.amazon.co.jp/dp/B0BXXXXXXX
```

### Search URL

```
https://www.amazon.co.jp/s?k=<keyword>
```

### Catatan
- web_extract kadang berhasil, kadang kena captcha
- ASIN = 10 karakter alfanumerik

---

## Cara Paling Efektif per Kategori

### Fashion/Sneakers (Baru)
1. Nama produk → **Nike** (web_extract langsung)
2. Nama produk → **Uniqlo** (web_extract SSR, parse __PRELOADED_STATE__)
3. Nama produk → **Rakuten** (web_extract)
4. Nama produk → **Amazon Japan** (web_extract)
5. **Adidas/YSL** → Cari di Rakuten, Amazon Japan, atau Yahoo Shopping

### Fashion/Sneakers (Limited/Vintage)
1. **Yahoo Auction** — scraper sudah ada
2. **Mercari** — browser vision fallback

### Elektronik
1. **Amazon Japan**
2. **Rakuten**
3. **Yahoo Shopping**

### Buku
1. **Amazon Japan**
2. **Rakuten Books**
