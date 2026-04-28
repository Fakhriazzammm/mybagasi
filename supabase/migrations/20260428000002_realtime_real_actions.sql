-- ============================================================
-- MyBagasi - Realtime + real action support
-- ============================================================

-- Alert pause/resume support. PostgreSQL versions before 16 do not support
-- IF NOT EXISTS for enum values in every environment, so guard manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'alert_status'
      AND e.enumlabel = 'paused'
  ) THEN
    ALTER TYPE alert_status ADD VALUE 'paused';
  END IF;
END $$;

-- Lightweight audit columns for actions that were previously UI-only.
ALTER TABLE wishlist_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE price_alerts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE procurement_queue
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_ref TEXT,
  ADD COLUMN IF NOT EXISTS failed_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE affiliate_payouts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

ALTER TABLE affiliate_commission_tiers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Keep updated_at reliable.
DROP TRIGGER IF EXISTS update_wishlist_items_updated_at ON wishlist_items;
CREATE TRIGGER update_wishlist_items_updated_at
  BEFORE UPDATE ON wishlist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_price_alerts_updated_at ON price_alerts;
CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON price_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_affiliate_payouts_updated_at ON affiliate_payouts;
CREATE TRIGGER update_affiliate_payouts_updated_at
  BEFORE UPDATE ON affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_affiliate_commission_tiers_updated_at ON affiliate_commission_tiers;
CREATE TRIGGER update_affiliate_commission_tiers_updated_at
  BEFORE UPDATE ON affiliate_commission_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Atomic procurement purchase action: updates queue, order, and tracking.
CREATE OR REPLACE FUNCTION mark_procurement_purchased(
  p_procurement_id UUID,
  p_purchase_ref TEXT DEFAULT NULL
)
RETURNS procurement_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row procurement_queue;
BEGIN
  IF auth_user_role() NOT IN ('ops_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Tidak punya akses untuk memproses procurement';
  END IF;

  UPDATE procurement_queue
  SET status = 'purchased',
      purchased_at = NOW(),
      purchase_ref = NULLIF(p_purchase_ref, ''),
      last_attempt_at = NOW(),
      updated_at = NOW()
  WHERE id = p_procurement_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement tidak ditemukan';
  END IF;

  UPDATE orders
  SET status = 'purchased',
      updated_at = NOW()
  WHERE id = v_row.order_id;

  UPDATE order_tracking
  SET is_current = FALSE
  WHERE order_id = v_row.order_id;

  INSERT INTO order_tracking (order_id, status, note, is_done, is_current, occurred_at)
  VALUES (
    v_row.order_id,
    'purchased',
    COALESCE('Pembelian selesai' || CASE WHEN p_purchase_ref IS NULL OR p_purchase_ref = '' THEN '' ELSE ' · Ref: ' || p_purchase_ref END, 'Pembelian selesai'),
    TRUE,
    TRUE,
    NOW()
  );

  RETURN v_row;
END;
$$;

-- Realtime publication. Duplicate-table errors are ignored so the migration is re-runnable.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'user_memberships',
    'membership_plans',
    'quotations',
    'orders',
    'order_tracking',
    'payments',
    'refunds',
    'points_ledger',
    'addresses',
    'wishlist_items',
    'price_alerts',
    'procurement_queue',
    'support_notes',
    'tracking_exceptions',
    'scraper_failures',
    'quote_approvals',
    'batch_shipments',
    'batch_participants',
    'preorders',
    'preorder_bookings',
    'marketplaces',
    'pricing_rules',
    'fee_settings',
    'shipping_routes',
    'affiliate_payouts',
    'affiliate_commission_tiers',
    'ai_settings',
    'categories',
    'testimonials',
    'faqs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;
