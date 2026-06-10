# MyBagasi Bot — Scraping & Fitur Enhancement Plan

> **Goal:** Tingkatkan kemampuan scraping (browser engine), tambah preview gambar, multi-source search, dan price tracker.

**Architecture:**
- Scraper backend: FastAPI (`main.py:8000`) — saat ini pake HTTP requests (httpx) + fallback screenshot AI
- Bot: Python asyncio polling (`telegram_bot.py`) — panggil scraper via `scraper_scrape()` / `scraper_search()`
- Marketplace scrapers: `scrapers/mercari.py`, `amazon_jp.py`, `rakuten.py`, `yahoo_auction.py`, `generic.py`
- Screenshot fallback: `scrapers/vision_extract.py` — pake Sumopod/AI vision buat extract dari screenshot

**Masalah:**
- HTTP-only scraping sering kena block / CAPTCHA / JS-rendered content
- Bot cuma kirim teks, belum ada gambar produk
- Search cuma 1 marketplace, gak bandingin harga
- Gak ada notifikasi harga turun

---

## 🌊 Wave 1: Browser Engine + Product Preview (Foundation)

### Task 1: Install Playwright & Setup Scraper

**Objective:** Tambah browser-based scraping pake Playwright.

**Files:**
- Modify: `scraper/requirements.txt`
- Modify: `scraper/scrapers/dispatcher.py`
- Create: `scraper/scrapers/browser.py`

**Detail:**

`requirements.txt` — tambah:
```
playwright>=1.50.0
```

`scraper/scrapers/browser.py` — baru:
```python
"""Browser-based scraper using Playwright for JS-rendered pages."""
import asyncio
import logging
from playwright.async_api import async_playwright, TimeoutError as PwTimeout

log = logging.getLogger("mybagasi_browser")

_browser = None
_playwright = None

async def get_browser():
    global _browser, _playwright
    if _browser is None:
        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
    return _browser

async def close_browser():
    global _browser, _playwright
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None

async def scrape_with_browser(url: str, timeout: int = 20) -> dict | None:
    """
    Buka URL dengan browser, ambil title, price, image, description.
    Returns dict dengan keys: title, price, price_jpy, image, description, marketplace, available
    """
    browser = await get_browser()
    context = None
    page = None
    try:
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 720},
            locale="ja-JP",
        )
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
        await asyncio.sleep(2)  # Biarkan JS render
        
        # Ekstrak data via page.evaluate
        data = await page.evaluate("""() => {
            const metaDesc = document.querySelector('meta[name="description"]');
            const ogImage = document.querySelector('meta[property="og:image"]');
            const ogTitle = document.querySelector('meta[property="og:title"]');
            const ogPrice = document.querySelector('meta[property="product:price:amount"]');
            
            return {
                title: ogTitle?.content || document.title || '',
                description: metaDesc?.content || '',
                image: ogImage?.content || '',
                price: ogPrice?.content || '',
                ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
            };
        }""")
        
        # Screenshot untuk AI fallback
        screenshot_bytes = await page.screenshot(full_page=False, type="png")
        
        return {
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "image": data.get("image", ""),
            "price": data.get("price", ""),
            "price_jpy": _parse_price(data.get("price", "")),
            "screenshot": screenshot_bytes,  # Base64-encoded for AI vision
            "available": True,
            "marketplace": _detect_marketplace(url),
        }
    except PwTimeout:
        log.warning(f"Browser timeout: {url[:60]}")
        return {"error": "timeout", "url": url}
    except Exception as e:
        log.error(f"Browser error: {e}")
        return {"error": str(e), "url": url}
    finally:
        if page:
            try: await page.close()
            except: pass
        if context:
            try: await context.close()
            except: pass

def _parse_price(price_str: str) -> int | None:
    import re
    if not price_str:
        return None
    digits = re.sub(r'[^0-9]', '', price_str)
    return int(digits) if digits else None

def _detect_marketplace(url: str) -> str:
    from urllib.parse import urlparse
    host = urlparse(url).hostname or ""
    if "mercari" in host: return "Mercari"
    if "amazon" in host: return "Amazon JP"
    if "rakuten" in host: return "Rakuten"
    if "yahoo" in host: return "Yahoo Auction"
    return "Japan Marketplace"
```

**Verifikasi:** `python3 -c "from scrapers.browser import scrape_with_browser; print('import OK')"`

---

### Task 2: Update Dispatcher — Browser Fallback Chain

**Objective:** Chain: HTTP scraper → browser → screenshot AI → fallback.

**Files:**
- Modify: `scraper/scrapers/dispatcher.py`

**Strategy baru:**
```
URL masuk
  → Cari pattern marketplace
    → HTTP scraper spesifik (existing)
      → Berhasil? return + image
      → Gagal (BLOCKED/PARSE_EMPTY)?
        → Browser scraper
          → Berhasil? return
          → Gagal?
            → Screenshot AI fallback (existing)
              → Return hasil
```

**Ubah `scrape_url()`:**
```python
async def scrape_url(url: str) -> ProductData:
    for pattern, scraper in _ROUTES:
        if re.search(pattern, url):
            try:
                primary = await scraper(url)
                if primary and not _needs_fallback(primary):
                    return primary
                # HTTP gagal → coba browser
                browser_result = await _browser_scrape_with_fallback(url)
                if browser_result:
                    return browser_result
                # Browser gagal → screenshot AI
                return await _maybe_screenshot_ai_fallback(url, primary)
            except Exception:
                browser_result = await _browser_scrape_with_fallback(url)
                if browser_result:
                    return browser_result
                result = await scrape_generic(_canonicalize_for_fallback(url))
                return await _maybe_screenshot_ai_fallback(url, result)
    # No pattern match → generic + browser
    browser_result = await _browser_scrape_with_fallback(url)
    if browser_result:
        return browser_result
    result = await scrape_generic(_canonicalize_for_fallback(url))
    return await _maybe_screenshot_ai_fallback(url, result)
```

**Tambah fungsi helper:**
```python
from .browser import scrape_with_browser as browser_scrape

async def _browser_scrape_with_fallback(url: str) -> ProductData | None:
    """Try browser scraping, return ProductData if successful."""
    try:
        raw = await asyncio.wait_for(browser_scrape(url), timeout=25.0)
        if raw and not raw.get("error") and raw.get("title"):
            return ProductData(
                title=raw["title"][:200],
                price_jpy=raw.get("price_jpy"),
                price_display=f"¥{raw['price_jpy']:,}" if raw.get("price_jpy") else "",
                images=[raw["image"]] if raw.get("image") else [],
                description=(raw.get("description") or "")[:500],
                marketplace=raw.get("marketplace", "Japan Marketplace"),
                available=raw.get("available", True),
                url=url,
                confidence="medium",
                scrape_reason_code="BROWSER_OK",
            )
    except Exception as e:
        log.warning(f"Browser fallback failed: {e}")
    return None

def _needs_fallback(product: ProductData) -> bool:
    reason = (product.scrape_reason_code or "").upper()
    return reason in ("BLOCKED", "PARSE_EMPTY", "NOT_FOUND") or not product.price_jpy
```

---

### Task 3: Bot — Product Preview dengan Gambar

**Objective:** Bot kirim gambar produk + detail + inline buttons.

**Files:**
- Modify: `scraper/telegram_bot.py`

**Step 1: Tambah fungsi kirim foto**
```python
async def tg_send_photo(chat_id: int, photo_url: str, caption: str, reply_markup: dict | None = None) -> dict | None:
    """Send a photo with caption."""
    try:
        payload = {"chat_id": chat_id, "photo": photo_url, "caption": caption, "parse_mode": "Markdown"}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(tg_url("sendPhoto"), json=payload)
            return r.json()
    except Exception as e:
        log.error(f"tg_send_photo error: {e}")
        return None
```

**Step 2: Update AI prompt — minta tool return image URL**

Di `SYSTEM_PROMPT`, tambah instruksi untuk format response yang include gambar.

**Step 3: Update `scraper_scrape()` untuk return image**

Ubah response scraper jadi include image_url di format:
```python
result["image_url"] = result.get("images", [None])[0] if result.get("images") else None
```

**Step 4: Update `execute_tool()` — kirim foto untuk hasil scrape**

Di tool `scrape_product`, setelah dapat result:
```python
if user_id and not result.get("error") and result.get("title"):
    # Kirim preview gambar
    if result.get("image_url"):
        await tg_send_photo(chat_id, result["image_url"], 
            f"📍 *{result['title'][:50]}*\n"
            f"💰 Harga: ¥{result.get('price_jpy', '?')}\n"
            f"🏪 {result.get('marketplace', 'Jepang')}")
```

---

### Task 4: Install Playwright + Test

**Objective:** Install Playwright browser binaries dan test scraping.

```bash
cd /opt/mybagasi/scraper
pip install playwright
playwright install chromium
```

**Verifikasi:**
```bash
python3 -c "from scrapers.browser import scrape_with_browser; import asyncio; print(asyncio.run(scrape_with_browser('https://jp.mercari.com/item/m1234567890')))"
```

---

## 🌊 Wave 2: Multi-Source Search & Price Tracker

### Task 5: Multi-Source Search

**Objective:** Search paralel ke 3-4 marketplace, gabung hasilnya.

**Files:**
- Create: `scraper/scrapers/search_multi.py`
- Modify: `scraper/main.py` (endpoint /search-multi)
- Modify: `scraper/telegram_bot.py` (tambah fitur banding)

**Detail:**

`search_multi.py`:
```python
"""Multi-source parallel search."""
import asyncio
import logging
from .search_web import search_products_by_keyword as search_mercari

log = logging.getLogger("mybagasi_search")

async def search_all_sources(keyword: str, limit: int = 4) -> dict:
    """Search multiple marketplaces in parallel."""
    tasks = {
        "Mercari": _search_source(search_mercari, keyword, limit),
        "Rakuten": _search_rakuten(keyword, limit),
        "Amazon JP": _search_amazon(keyword, limit),
    }
    results = {}
    for name, task in tasks.items():
        try:
            items = await asyncio.wait_for(task, timeout=30)
            results[name] = items
        except asyncio.TimeoutError:
            results[name] = []
        except Exception as e:
            log.warning(f"{name} search failed: {e}")
            results[name] = []
    
    # Merge and sort by price
    all_items = []
    for source, items in results.items():
        for item in items:
            item["_source"] = source
            all_items.append(item)
    all_items.sort(key=lambda x: x.get("price_jpy") or 999999)
    
    return {"success": True, "items": all_items[:limit], "sources": list(results.keys())}

async def _search_rakuten(keyword: str, limit: int) -> list:
    # Implementasi search Rakuten (HTTP + parse)
    ...

async def _search_amazon(keyword: str, limit: int) -> list:
    # Implementasi search Amazon JP
    ...
```

### Task 6: Price Tracker + Notification

**Objective:** Cron job tiap X jam cek harga, kirim notifikasi kalau turun.

**Files:**
- Create: `scraper/price_tracker.py`
- Modify: `scraper/telegram_bot.py` (tambah handler notifikasi)

**Detail:**

```python
"""Periodic price checker for user alerts."""
async def check_price_alerts():
    """Run every 6 hours. Check all active price_alerts."""
    alerts = await fetch_active_alerts()
    for alert in alerts:
        current = await scrape_product_price(alert["url"])
        if current and current < alert["target_price"]:
            await notify_user(alert["user_id"], alert["product"], current)
            await deactivate_alert(alert["id"])
```

**Jadwal cron:** Jalankan via cron job di system atau Hermes cron.

---

## ✅ Verifikasi

| Fitur | Cara Test |
|-------|-----------|
| Browser scraping | Kirim link Mercari/Rakuten → dapat data + gambar |
| Fallback chain | Blokir HTTP scraper → otomatis pake browser |
| Preview gambar | Bot kirim foto produk + caption + tombol |
| Multi search | `/banding onitsuka tiger` → hasil dari 3+ marketplace |
| Price tracker | `/pantau https://... 500000` → cek cron notifikasi |

---

## ⚠️ Pitfalls

1. **Playwright memory** — Browser instance bisa bocor memory. Pastikan `close_browser()` dipanggil di shutdown hook (`@app.on_event("shutdown")`)
2. **Concurrent browser access** — `get_browser()` return singleton. Jangan pake untuk scrape paralel tanpa context manager. Setiap page harus pake `new_context()` terpisah
3. **User Agent rotation** — Beberapa marketplace deteksi headless. Rotate UA + tambah `--disable-blink-features=AutomationControlled`
4. **Rate limiting** — Mercari & Amazon punya rate limit ketat. Tambah delay 1-3s antar request
5. **Image URL expiry** — Beberapa marketplace pake signed URL yang expired. Jangan cache image URL >1 jam
6. **Telegram photo size** — Max 10MB. Kalau gambar terlalu besar, kompres atau kirim sebagai document
7. **Cron overlap** — Price tracker cron bisa overlap. Gunakan lock file: `flock -n /tmp/price_tracker.lock`
