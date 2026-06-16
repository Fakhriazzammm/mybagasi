-- ============================================================
-- Ubah starting_price dari IDR ke JPY per kg
-- Konversi: 50,000 IDR → 500 JPY, 75,000 → 750, 100,000 → 1,000
-- ============================================================

-- Update MyBagasi & Jastip: 50,000 IDR → 500 JPY
UPDATE personal_shoppers
SET starting_price = 500
WHERE slug = 'mybagasi-jastip' AND starting_price = 50000;

-- Update Shln.page: 75,000 IDR → 750 JPY
UPDATE personal_shoppers
SET starting_price = 750
WHERE slug = 'shln-page' AND starting_price = 75000;

-- Update Jastip.shinrai: 100,000 IDR → 1,000 JPY
UPDATE personal_shoppers
SET starting_price = 1000
WHERE slug = 'jastip-shinrai' AND starting_price = 100000;
