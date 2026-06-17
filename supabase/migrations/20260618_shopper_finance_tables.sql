-- Migration: Shopper Finance Tables
-- Created: 2026-06-18
-- Description: Adds shopper_receipts and shopper_receipt_items tables for financial tracking

-- =============================================
-- Table: shopper_receipts
-- Financial receipts for personal shopper expenses
-- =============================================
CREATE TABLE IF NOT EXISTS shopper_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id UUID REFERENCES personal_shoppers(id) ON DELETE CASCADE,
  file_name TEXT,
  total_yen NUMERIC(12,2) DEFAULT 0,
  total_idr NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Table: shopper_receipt_items
-- Line items within each receipt
-- =============================================
CREATE TABLE IF NOT EXISTS shopper_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID REFERENCES shopper_receipts(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  price_yen NUMERIC(12,2),
  price_idr NUMERIC(12,2),
  qty INTEGER DEFAULT 1,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_shopper_receipts_shopper_id ON shopper_receipts(shopper_id);
CREATE INDEX IF NOT EXISTS idx_shopper_receipts_created_at ON shopper_receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopper_receipt_items_receipt_id ON shopper_receipt_items(receipt_id);

-- =============================================
-- Row-Level Security (RLS)
-- =============================================
ALTER TABLE shopper_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopper_receipt_items ENABLE ROW LEVEL SECURITY;

-- Shoppers can see their own receipts
CREATE POLICY "shoppers_select_own_receipts"
  ON shopper_receipts
  FOR SELECT
  USING (
    shopper_id IN (
      SELECT id FROM personal_shoppers WHERE user_id = auth.uid()
    )
  );

-- Finance and admin can see all receipts
CREATE POLICY "admin_select_all_receipts"
  ON shopper_receipts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('finance', 'super_admin', 'ops_admin')
    )
  );

-- Finance and admin can insert receipts
CREATE POLICY "admin_insert_receipts"
  ON shopper_receipts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('finance', 'super_admin', 'ops_admin')
    )
  );

-- Finance and admin can update receipts
CREATE POLICY "admin_update_receipts"
  ON shopper_receipts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('finance', 'super_admin', 'ops_admin')
    )
  );

-- Replicate similar policies for receipt items
CREATE POLICY "shoppers_select_own_receipt_items"
  ON shopper_receipt_items
  FOR SELECT
  USING (
    receipt_id IN (
      SELECT id FROM shopper_receipts WHERE shopper_id IN (
        SELECT id FROM personal_shoppers WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "admin_select_all_receipt_items"
  ON shopper_receipt_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('finance', 'super_admin', 'ops_admin')
    )
  );

CREATE POLICY "admin_insert_receipt_items"
  ON shopper_receipt_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('finance', 'super_admin', 'ops_admin')
    )
  );

CREATE POLICY "admin_update_receipt_items"
  ON shopper_receipt_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('finance', 'super_admin', 'ops_admin')
    )
  );
