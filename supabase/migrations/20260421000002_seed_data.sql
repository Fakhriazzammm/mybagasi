-- ============================================================
-- Seed Data - Configuration Tables
-- ============================================================

-- MEMBERSHIP PLANS
INSERT INTO membership_plans (name, price_monthly, discount_percent, point_multiplier, priority_procurement, features) VALUES
('Free',   0,      0,    1.0, FALSE, '["Unlimited quotations","Order tracking","WhatsApp bot"]'),
('Plus',   49000,  5,    1.5, FALSE, '["5% fee discount","1.5x points","Priority price alerts","Auto batch shipping"]'),
('Pro',    149000, 10,   2.0, TRUE,  '["10% fee discount","2x points","Pre-order access","Personal shopper","Reseller dashboard","Priority procurement"]'),
('Seller', 399000, 15,   3.0, TRUE,  '["15% fee discount","3x points","Priority procurement","Seller tools"]');

-- MARKETPLACES
INSERT INTO marketplaces (name, domain, scraper_health, orders_mtd, active) VALUES
('Mercari',       'mercari.com',          98, 342, TRUE),
('Rakuten',       'rakuten.co.jp',        95, 218, TRUE),
('Amazon JP',     'amazon.co.jp',         99, 185, TRUE),
('Yahoo Auction', 'auctions.yahoo.co.jp', 87, 127, TRUE),
('ZOZOTOWN',      'zozo.jp',              92, 64,  TRUE),
('Muji JP',       'muji.com/jp',          100,41,  TRUE),
('Map Camera',    'mapcamera.com',        78, 23,  TRUE),
('Ippodo',        'ippodo-tea.co.jp',     100,15,  TRUE);

-- SHIPPING ROUTES
INSERT INTO shipping_routes (route, price_per_kg, eta, min_weight, active) VALUES
('Tokyo → Jakarta (Air)',    285000, '5-7 hari',   '0.1 kg', TRUE),
('Tokyo → Jakarta (Batch)',  185000, '8-12 hari',  '0.1 kg', TRUE),
('Osaka → Surabaya (Sea)',   95000,  '20-25 hari', '5 kg',   TRUE),
('Tokyo → Bali (Air)',       320000, '6-8 hari',   '0.1 kg', TRUE),
('Tokyo → Bandung (Air)',    295000, '6-8 hari',   '0.1 kg', FALSE);

-- PRICING RULES
INSERT INTO pricing_rules (name, type, value, apply_to, active) VALUES
('Standard service fee',         'percent', 8,      'Free tier',          TRUE),
('Plus member service fee',      'percent', 6,      'Plus tier',          TRUE),
('Pro member service fee',       'percent', 5,      'Pro tier',           TRUE),
('Seller member service fee',    'percent', 4,      'Seller tier',        TRUE),
('High-value markup (>Rp 5jt)', 'percent', 3,      'item_value > 5000000', TRUE),
('Minimum service fee',          'flat',    25000,  'all orders',         TRUE);

-- FEE SETTINGS
INSERT INTO fee_settings (key, value, description) VALUES
('jpy_idr_rate',         '107.50',   'JPY ke IDR rate (auto-update tiap 6 jam dari xe.com)'),
('payment_gateway_fee',  '2.5',      'Payment gateway fee (%) dibebankan ke customer'),
('insurance_fee',        '1.0',      'Biaya asuransi (% dari nilai barang, opsional)'),
('customs_handling_fee', '50000',    'Biaya penanganan bea cukai per pengiriman (IDR)'),
('free_storage_days',    '14',       'Gratis penyimpanan di gudang (hari)'),
('storage_fee_per_day',  '5000',     'Biaya penyimpanan setelah free period (IDR/hari)'),
('rate_source',          'xe.com',   'Sumber kurs mata uang'),
('rate_update_interval', '6',        'Interval update kurs (jam)');

-- AFFILIATE COMMISSION TIERS
INSERT INTO affiliate_commission_tiers (tier, min_orders, commission_percent, payout_min) VALUES
('Starter',     0,   3,  100000),
('Creator',     10,  5,  250000),
('Top Creator', 50,  8,  500000),
('Elite',       200, 12, 1000000);

-- AI SETTINGS
INSERT INTO ai_settings (key, value, description) VALUES
('primary_model',     'google/gemini-2.5-flash', 'Model AI utama untuk chat & quotation'),
('fallback_model',    'openai/gpt-4o-mini',      'Model fallback jika primary tidak tersedia'),
('max_tokens',        '4096',                    'Maksimum token per sesi chat'),
('temperature',       '0.7',                     'Kreativitas model (0=strict, 1=creative)'),
('rate_limit',        '30',                      'Maksimum request per menit per user'),
('auto_suggest',      'true',                    'Auto-suggest dari foto/link produk');

-- BATCH SHIPMENTS (sample active batches)
INSERT INTO batch_shipments (name, route, closes_at, arrives_at, capacity, price_per_kg, savings_percent, status) VALUES
('Batch #47 - Tokyo Express',   'Tokyo → Jakarta (Batch)',  NOW() + INTERVAL '3 days',  CURRENT_DATE + 15, 500, 185000, 35, 'open'),
('Batch #48 - Osaka Cargo',     'Osaka → Surabaya (Sea)',   NOW() + INTERVAL '5 days',  CURRENT_DATE + 30, 1000, 95000, 48, 'open'),
('Batch #46 - Tokyo Air',       'Tokyo → Jakarta (Air)',    NOW() + INTERVAL '1 day',   CURRENT_DATE + 8,  300, 285000, 20, 'closing_soon');

-- PRE-ORDERS (sample items)
INSERT INTO preorders (emoji, name, brand, release_date, retail_jpy, estimate_idr, dp_idr, quota_total, quota_taken, closes_at, tag, active) VALUES
('👟', 'Nike Air Max 2025 Japan Exclusive',    'Nike',            '2026-05-15', 22000, 3200000, 800000,  50, 38, NOW() + INTERVAL '10 days', 'Hot',         TRUE),
('⌚', 'Seiko Prospex SPB453J1',              'Seiko',           '2026-06-01', 85000, 12500000, 3000000, 20, 12, NOW() + INTERVAL '20 days', 'Limited',     TRUE),
('🎮', 'Nintendo Switch 2 Special Bundle',    'Nintendo',        '2026-04-25', 49800, 7200000, 1800000,  30, 29, NOW() + INTERVAL '2 days',  'Closing soon',TRUE),
('👜', 'Comme des Garçons SS2026 Tote',       'Comme des Garçons','2026-05-20', 18000, 2600000, 650000,  40, 5,  NOW() + INTERVAL '15 days', 'New',         TRUE),
('🍵', 'Gyokuro Premium 2026 Harvest',        'Ippodo',          '2026-05-01', 8500,  1250000, 0,        100, 23, NOW() + INTERVAL '25 days', 'Seasonal',    TRUE),
('📷', 'Fujifilm X100VI Limited Black',       'Fujifilm',        '2026-07-01', 230000, 33500000, 8000000, 10, 3, NOW() + INTERVAL '30 days', 'Pre-launch',  TRUE);
