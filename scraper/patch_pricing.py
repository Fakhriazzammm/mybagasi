# Apply pricing system changes to telegram_bot.py
import re

with open('/opt/mybagasi/scraper/telegram_bot.py', 'r') as f:
    content = f.read()

# 1. Replace old constants
content = content.replace(
    'JPY_TO_IDR = 105\nSERVICE_FEE_RATE = 0.15\nSHIPPING_IDR = 250000\nTAX_RATE = 0.08',
    '# ── Pricing Config (diambil dari DB, fallback hardcoded) ──\n_PRICING_CACHE: dict[str, any] = {}\n_PRICING_CACHE_TIME = 0\n\n# Default fallback\nJPY_TO_IDR = 105\nSHIPPING_IDR = 250000\nTAX_RATE = 0.08'
)

# 2. Add pricing functions after supabase_insert
old_insert_end = "        log.error(f\"INSERT {table} error: {e}\")\n        return None"
new_functions = """        log.error(f"INSERT {table} error: {e}")
        return None

# ── Pricing System ──────────────────────────────────────────
_PRICING_CACHE_DATA: dict = {}
_PRICING_CACHE_AT = 0.0
_PRICING_CACHE_TTL = 300  # 5 menit

async def _ensure_pricing_table():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
    seed = [
        {"key": "exchange_rate", "value": {"rate": 105, "source": "hardcoded", "auto_update": True, "last_fetched": None}},
        {"key": "profit_tiers", "value": {"tiers": [
            {"min": 0, "max": 999999, "profit": 100000},
            {"min": 1000000, "max": 2999999, "profit": 300000},
            {"min": 3000000, "max": 4999999, "profit": 500000},
            {"min": 5000000, "max": 9999999, "profit": 1000000},
            {"min": 10000000, "max": 999999999, "profit": 2000000}
        ]}},
        {"key": "shipping_cost", "value": {"cost": 250000, "description": "Ongkir Jepang ke Indonesia"}},
        {"key": "tax_rate", "value": {"rate": 0.08, "description": "Pajak & bea cukai 8%"}},
    ]
    async with httpx.AsyncClient(timeout=10) as client:
        for s in seed:
            r = await client.post(f"{SUPABASE_URL}/rest/v1/pricing_config", json=s, headers={**headers, "Prefer": "resolution=merge-duplicates"})
            if r.status_code == 404:
                log.warning("pricing_config table not found, using hardcoded defaults")
                return

async def refresh_pricing_cache():
    global _PRICING_CACHE_DATA, _PRICING_CACHE_AT
    now = time.time()
    if now - _PRICING_CACHE_AT < _PRICING_CACHE_TTL:
        return
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{SUPABASE_URL}/rest/v1/pricing_config", headers=headers, params={"select": "key,value"})
            if r.status_code == 200 and r.json():
                for item in r.json():
                    _PRICING_CACHE_DATA[item["key"]] = item["value"]
                _PRICING_CACHE_AT = now
                log.info(f"Pricing config refreshed: {len(_PRICING_CACHE_DATA)} keys")
    except Exception as e:
        log.warning(f"Failed to refresh pricing config: {e}")

async def get_exchange_rate() -> int:
    await refresh_pricing_cache()
    cfg = _PRICING_CACHE_DATA.get("exchange_rate", {})
    rate = cfg.get("rate", 105)
    if cfg.get("auto_update") and not cfg.get("last_fetched"):
        rate = await _fetch_live_rate()
    elif cfg.get("auto_update") and cfg.get("last_fetched"):
        import datetime
        try:
            last = cfg["last_fetched"]
            if isinstance(last, str):
                last = last.replace("Z", "+00:00")
                last_dt = datetime.datetime.fromisoformat(last)
                if (datetime.datetime.now(datetime.timezone.utc) - last_dt).total_seconds() > 3600:
                    rate = await _fetch_live_rate()
        except:
            pass
    return rate

async def _fetch_live_rate() -> int:
    import datetime
    urls = [
        "https://api.exchangerate-api.com/v4/latest/JPY",
        "https://open.er-api.com/v6/latest/JPY",
    ]
    for url in urls:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    idr = data["rates"].get("IDR")
                    if idr:
                        rate = round(idr)
                        log.info(f"Live JPY/IDR rate: {rate}")
                        try:
                            await client.patch(
                                f"{SUPABASE_URL}/rest/v1/pricing_config?key=eq.exchange_rate",
                                json={"value": {"rate": rate, "source": url.split('/')[2], "auto_update": True, "last_fetched": datetime.datetime.now(datetime.timezone.utc).isoformat()}},
                                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
                            )
                        except:
                            pass
                        return rate
        except Exception as e:
            log.warning(f"Rate fetch failed from {url}: {e}")
    return 105

async def get_shipping_cost() -> int:
    await refresh_pricing_cache()
    return _PRICING_CACHE_DATA.get("shipping_cost", {}).get("cost", 250000)

async def get_tax_rate() -> float:
    await refresh_pricing_cache()
    return _PRICING_CACHE_DATA.get("tax_rate", {}).get("rate", 0.08)

async def get_profit_tiers() -> list:
    await refresh_pricing_cache()
    return _PRICING_CACHE_DATA.get("profit_tiers", {}).get("tiers", [])

async def calculate_profit(price_idr: int) -> int:
    tiers = await get_profit_tiers()
    for tier in tiers:
        if tier["min"] <= price_idr <= tier["max"]:
            return tier["profit"]
    if tiers:
        return tiers[-1]["profit"]
    return round(price_idr * 0.15)

async def estimate_price_v2(price_jpy: int) -> dict:
    rate = await get_exchange_rate()
    shipping = await get_shipping_cost()
    tax_rate = await get_tax_rate()
    base_idr = price_jpy * rate
    profit = await calculate_profit(base_idr)
    tax = round((base_idr + profit) * tax_rate)
    total = base_idr + profit + shipping + tax
    return {
        "base_idr": base_idr, "profit": profit,
        "shipping": shipping, "tax": tax, "total": total,
        "rate": rate, "tax_rate": tax_rate,
    }"""

content = content.replace(old_insert_end, new_functions)

# 3. Update save_quotation
old_sq = content.find("async def save_quotation")
end_sq = content.find("async def save_order")
old_sq_block = content[old_sq:end_sq]
new_sq_block = """async def save_quotation(user_id: str, product: str, price_jpy: int, source: str,
                         url: str | None = None, exchange_rate: int = 0) -> dict | None:
    est = await estimate_price_v2(price_jpy)
    data = {
        "user_id": user_id,
        "product": product[:200],
        "url": url or None,
        "source": source,
        "price_jpy": price_jpy,
        "exchange_rate": est["rate"],
        "service_fee": est["profit"],
        "shipping_cost": est["shipping"],
        "tax_customs": est["tax"],
        "membership_discount": 0,
        "points_used": 0,
        "total": est["total"],
        "status": "active",
    }
    return await supabase_insert("quotations", data)

"""
content = content.replace(old_sq_block, new_sq_block)

# 4. Update save_order
old_so = content.find("async def save_order")
end_so = content.find("async def save_wishlist_item")
old_so_block = content[old_so:end_so]
new_so_block = """async def save_order(user_id: str, product: str, price_jpy: int, total: int,
                     source: str = "telegram_bot", quotation_id: str | None = None,
                     customer_name: str = "", notes: str = "") -> dict | None:
    est = await estimate_price_v2(price_jpy)
    data = {
        "user_id": user_id,
        "quotation_id": quotation_id or None,
        "product": product[:200],
        "source": source,
        "price_jpy": price_jpy,
        "exchange_rate": est["rate"],
        "service_fee": est["profit"],
        "shipping_cost": est["shipping"],
        "tax_customs": est["tax"],
        "membership_discount": 0,
        "points_used": 0,
        "total": est["total"],
        "status": "waiting_payment",
        "notes": f"[Telegram Bot] {customer_name[:50]}\\n{notes[:200]}" if notes else f"[Telegram Bot] {customer_name[:50]}" if customer_name else "Telegram Bot",
        "eta": None,
    }
    return await supabase_insert("orders", data)

"""
content = content.replace(old_so_block, new_so_block)

# 5. Replace estimate_price function
old_ep = "def estimate_price(product_jpy: int) -> dict:\n    base_idr = product_jpy * JPY_TO_IDR\n    fee = round(base_idr * SERVICE_FEE_RATE)\n    tax = round((base_idr + fee) * TAX_RATE)\n    total = base_idr + fee + SHIPPING_IDR + tax\n    return {\"base_idr\": base_idr, \"fee\": fee, \"shipping\": SHIPPING_IDR, \"tax\": tax, \"total\": total, \"rate\": JPY_TO_IDR}"
new_ep = """async def estimate_price(product_jpy: int) -> dict:
    return await estimate_price_v2(product_jpy)"""
content = content.replace(old_ep, new_ep)

# 6. Update SYSTEM_PROMPT pricing instructions
old_conv = "KONVERSI:\n- Kurs: 1 JPY = Rp 105\n- Fee jasa MyBagasi: 15% dari harga produk (IDR)\n- Ongkir Jepang \\u2192 Indonesia: Rp 250.000\n- Pajak & bea cukai: 8% dari (harga produk + fee jasa)"
new_conv = """KONVERSI:
- Kurs: 1 JPY = Rp __ (realtime, ambil dari internet)
- Profit MyBagasi: berdasarkan tier harga produk:
  \\u2022 Rp0 - Rp999.999 \\u2192 Rp100.000
  \\u2022 Rp1jt - Rp2.999.999 \\u2192 Rp300.000
  \\u2022 Rp3jt - Rp4.999.999 \\u2192 Rp500.000
  \\u2022 Rp5jt - Rp9.999.999 \\u2192 Rp1.000.000
  \\u2022 Rp10jt+ \\u2192 Rp2.000.000
- Ongkir Jepang \\u2192 Indonesia: Rp 250.000
- Pajak & bea cukai: 8% dari (harga produk + profit)"""
content = content.replace(old_conv, new_conv)

# 7. Update examples
content = content.replace(
    '\\u2022 Harga Produk: Rp1.470.000\n\\u2022 Fee Jasa 15%: Rp220.500\n\\u2022 Ongkir: Rp250.000\n\\u2022 Pajak 8%: Rp135.240\n\\u2022 Total All-in: Rp2.075.740',
    '\\u2022 Harga Produk: Rp1.470.000 (JPY 14.000 \\u00d7 Rp105)\n\\u2022 Profit MyBagasi: Rp300.000 (tier Rp1jt - Rp3jt)\n\\u2022 Ongkir: Rp250.000\n\\u2022 Pajak 8%: Rp141.600\n\\u2022 Total All-in: Rp2.161.600'
)
content = content.replace(
    '\\u2022 Harga Produk: Rp2.100.000\n\\u2022 Fee Jasa 15%: Rp315.000\n\\u2022 Ongkir: Rp250.000\n\\u2022 Pajak 8%: Rp193.200\n\\u2022 Total All-in: Rp2.858.200',
    '\\u2022 Harga Produk: Rp2.100.000 (JPY 20.000 \\u00d7 Rp105)\n\\u2022 Profit MyBagasi: Rp300.000 (tier Rp1jt - Rp3jt)\n\\u2022 Ongkir: Rp250.000\n\\u2022 Pajak 8%: Rp212.000\n\\u2022 Total All-in: Rp2.862.000'
)

# 8. Init pricing on startup
content = content.replace(
    '    log.info(f"Bot starting... @mybagasibot")',
    '    log.info(f"Bot starting... @mybagasibot")\n    await _ensure_pricing_table()\n    await refresh_pricing_cache()\n    rate = await get_exchange_rate()\n    log.info(f"Pricing: rate={rate}")'
)

with open('/opt/mybagasi/scraper/telegram_bot.py', 'w') as f:
    f.write(content)

try:
    compile(content, 'telegram_bot.py', 'exec')
    print('SYNTAX OK')
except SyntaxError as e:
    print(f'SYNTAX ERROR: {e}')
