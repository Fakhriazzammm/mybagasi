-- ─────────────────────────────────────────────
-- Migration: Cart Items V2 — add pricing fields
-- Supabase sudah punya cart_items dari migration
-- 20260611000001_cart_items.sql. Migration ini
-- menambahkan kolom pricing + perbaikan schema.
-- ─────────────────────────────────────────────

-- 1. Tambah kolom baru (jika belum ada)
DO $$
BEGIN
  -- catalog_item_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='catalog_item_id') THEN
    ALTER TABLE cart_items ADD COLUMN catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL;
  END IF;

  -- price_idr
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='price_idr') THEN
    ALTER TABLE cart_items ADD COLUMN price_idr INTEGER DEFAULT 0;
  END IF;

  -- category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='category') THEN
    ALTER TABLE cart_items ADD COLUMN category TEXT DEFAULT '';
  END IF;

  -- shipping_category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='shipping_category') THEN
    ALTER TABLE cart_items ADD COLUMN shipping_category TEXT DEFAULT 'general';
  END IF;

  -- estimated_fee
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='estimated_fee') THEN
    ALTER TABLE cart_items ADD COLUMN estimated_fee INTEGER DEFAULT 0;
  END IF;

  -- estimated_shipping
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='estimated_shipping') THEN
    ALTER TABLE cart_items ADD COLUMN estimated_shipping INTEGER DEFAULT 0;
  END IF;

  -- estimated_tax
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='estimated_tax') THEN
    ALTER TABLE cart_items ADD COLUMN estimated_tax INTEGER DEFAULT 0;
  END IF;

  -- estimated_total
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cart_items' AND column_name='estimated_total') THEN
    ALTER TABLE cart_items ADD COLUMN estimated_total INTEGER DEFAULT 0;
  END IF;

  -- quantity constraint (jika belum ada)
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='cart_items_quantity_check') THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_quantity_check CHECK (quantity >= 1 AND quantity <= 99);
  END IF;
END $$;

-- 2. Add index for catalog_item_id (jika belum ada)
CREATE INDEX IF NOT EXISTS idx_cart_items_catalog_item ON cart_items(catalog_item_id);
