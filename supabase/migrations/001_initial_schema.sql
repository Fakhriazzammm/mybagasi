-- ============================================================
-- MyBagasi - Complete Supabase Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('customer', 'ops_admin', 'support', 'finance', 'affiliate', 'super_admin');
CREATE TYPE membership_tier AS ENUM ('Free', 'Plus', 'Pro', 'Seller');
CREATE TYPE user_status AS ENUM ('active', 'suspended');
CREATE TYPE order_status AS ENUM (
  'draft', 'quote_created', 'waiting_payment', 'paid',
  'procurement_queue', 'purchased', 'in_japan_warehouse',
  'packed', 'shipped_to_indonesia', 'customs_clearance',
  'last_mile_delivery', 'delivered', 'cancelled', 'refunded'
);
CREATE TYPE quotation_status AS ENUM ('active', 'expired', 'converted');
CREATE TYPE payment_status AS ENUM ('settled', 'pending', 'failed');
CREATE TYPE payment_method AS ENUM ('VA BCA', 'QRIS', 'VA Mandiri', 'Credit Card', 'VA BNI', 'GoPay', 'ShopeePay');
CREATE TYPE refund_status AS ENUM ('pending_review', 'approved', 'processing', 'completed');
CREATE TYPE priority_level AS ENUM ('high', 'normal', 'low');
CREATE TYPE support_channel AS ENUM ('WhatsApp', 'Email');
CREATE TYPE support_status AS ENUM ('open', 'in_progress', 'resolved');
CREATE TYPE points_type AS ENUM ('earn', 'redeem', 'expire');
CREATE TYPE batch_status AS ENUM ('open', 'closing_soon', 'closed', 'shipping');
CREATE TYPE alert_status AS ENUM ('monitoring', 'triggered');
CREATE TYPE affiliate_payout_status AS ENUM ('pending', 'approved', 'paid');
CREATE TYPE pricing_type AS ENUM ('percent', 'flat');
CREATE TYPE procurement_status AS ENUM ('pending', 'purchasing', 'purchased', 'failed');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'customer',
  tier membership_tier NOT NULL DEFAULT 'Free',
  status user_status NOT NULL DEFAULT 'active',
  points_balance INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEMBERSHIP PLANS
-- ============================================================
CREATE TABLE membership_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name membership_tier NOT NULL UNIQUE,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  point_multiplier DECIMAL(3,1) NOT NULL DEFAULT 1.0,
  priority_procurement BOOLEAN NOT NULL DEFAULT FALSE,
  features JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USER MEMBERSHIPS
-- ============================================================
CREATE TABLE user_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES membership_plans(id),
  tier membership_tier NOT NULL DEFAULT 'Free',
  spent_amount BIGINT NOT NULL DEFAULT 0,
  target_amount BIGINT NOT NULL DEFAULT 0,
  renews_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- ADDRESSES
-- ============================================================
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Rumah',
  recipient TEXT NOT NULL,
  phone TEXT NOT NULL,
  line TEXT NOT NULL,
  city TEXT NOT NULL,
  postal TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MARKETPLACES
-- ============================================================
CREATE TABLE marketplaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  scraper_health INTEGER NOT NULL DEFAULT 100,
  orders_mtd INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTATIONS
-- ============================================================
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  url TEXT,
  source TEXT,
  price_jpy INTEGER,
  exchange_rate DECIMAL(10,2),
  service_fee INTEGER NOT NULL DEFAULT 0,
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  tax_customs INTEGER NOT NULL DEFAULT 0,
  membership_discount INTEGER NOT NULL DEFAULT 0,
  points_used INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status quotation_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id),
  address_id UUID REFERENCES addresses(id),
  product TEXT NOT NULL,
  source TEXT,
  price_jpy INTEGER,
  exchange_rate DECIMAL(10,2),
  service_fee INTEGER NOT NULL DEFAULT 0,
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  tax_customs INTEGER NOT NULL DEFAULT 0,
  membership_discount INTEGER NOT NULL DEFAULT 0,
  points_used INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status order_status NOT NULL DEFAULT 'draft',
  tracking_number TEXT,
  shipping_route TEXT,
  weight_kg DECIMAL(6,2),
  notes TEXT,
  eta DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORDER TRACKING TIMELINE
-- ============================================================
CREATE TABLE order_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  note TEXT,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  gateway_ref TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFUNDS
-- ============================================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status refund_status NOT NULL DEFAULT 'pending_review',
  reviewed_by UUID REFERENCES profiles(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- POINTS LEDGER
-- ============================================================
CREATE TABLE points_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  type points_type NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROCUREMENT QUEUE
-- ============================================================
CREATE TABLE procurement_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  price_jpy INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  priority priority_level NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES profiles(id),
  notes TEXT,
  status procurement_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUPPORT NOTES
-- ============================================================
CREATE TABLE support_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  channel support_channel NOT NULL DEFAULT 'WhatsApp',
  note TEXT NOT NULL,
  agent_id UUID REFERENCES profiles(id),
  status support_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BATCH SHIPMENTS
-- ============================================================
CREATE TABLE batch_shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  route TEXT NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  arrives_at DATE,
  capacity INTEGER NOT NULL,
  price_per_kg INTEGER NOT NULL,
  savings_percent INTEGER NOT NULL DEFAULT 0,
  status batch_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BATCH PARTICIPANTS
-- ============================================================
CREATE TABLE batch_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES batch_shipments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  items INTEGER NOT NULL DEFAULT 1,
  weight_kg DECIMAL(6,2) NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, user_id)
);

-- ============================================================
-- PRE-ORDERS
-- ============================================================
CREATE TABLE preorders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  emoji TEXT NOT NULL DEFAULT '📦',
  name TEXT NOT NULL,
  brand TEXT,
  release_date DATE,
  retail_jpy INTEGER,
  estimate_idr INTEGER,
  dp_idr INTEGER,
  quota_total INTEGER NOT NULL,
  quota_taken INTEGER NOT NULL DEFAULT 0,
  closes_at TIMESTAMPTZ,
  tag TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRE-ORDER BOOKINGS
-- ============================================================
CREATE TABLE preorder_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preorder_id UUID NOT NULL REFERENCES preorders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL DEFAULT 'dp',
  amount_paid INTEGER NOT NULL,
  amount_remaining INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WISHLIST ITEMS
-- ============================================================
CREATE TABLE wishlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '🛍️',
  name TEXT NOT NULL,
  url TEXT,
  price_idr INTEGER,
  source TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRICE ALERTS
-- ============================================================
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  url TEXT,
  current_price INTEGER,
  target_price INTEGER NOT NULL,
  status alert_status NOT NULL DEFAULT 'monitoring',
  last_checked_at TIMESTAMPTZ,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRACKING EXCEPTIONS
-- ============================================================
CREATE TABLE tracking_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  severity priority_level NOT NULL DEFAULT 'normal',
  tracking_number TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SCRAPER FAILURES
-- ============================================================
CREATE TABLE scraper_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketplace_id UUID REFERENCES marketplaces(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  reason TEXT NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTE APPROVALS
-- ============================================================
CREATE TABLE quote_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reviewed_by UUID REFERENCES profiles(id),
  approved BOOLEAN,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRICING RULES
-- ============================================================
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type pricing_type NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  apply_to TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FEE SETTINGS (key-value store)
-- ============================================================
CREATE TABLE fee_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SHIPPING ROUTES
-- ============================================================
CREATE TABLE shipping_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route TEXT NOT NULL,
  price_per_kg INTEGER NOT NULL,
  eta TEXT,
  min_weight TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AFFILIATE COMMISSION TIERS
-- ============================================================
CREATE TABLE affiliate_commission_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier TEXT NOT NULL,
  min_orders INTEGER NOT NULL,
  commission_percent DECIMAL(5,2) NOT NULL,
  payout_min INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AFFILIATE PAYOUTS
-- ============================================================
CREATE TABLE affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  orders_count INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL,
  status affiliate_payout_status NOT NULL DEFAULT 'pending',
  period TEXT NOT NULL,
  approved_by UUID REFERENCES profiles(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI SETTINGS (key-value store)
-- ============================================================
CREATE TABLE ai_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_tier ON profiles(tier);
CREATE INDEX idx_quotations_user_id ON quotations(user_id);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_tracking_order_id ON order_tracking(order_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_refunds_user_id ON refunds(user_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_points_ledger_user_id ON points_ledger(user_id);
CREATE INDEX idx_procurement_queue_status ON procurement_queue(status);
CREATE INDEX idx_procurement_queue_priority ON procurement_queue(priority);
CREATE INDEX idx_support_notes_user_id ON support_notes(user_id);
CREATE INDEX idx_support_notes_status ON support_notes(status);
CREATE INDEX idx_addresses_user_id ON addresses(user_id);
CREATE INDEX idx_wishlist_user_id ON wishlist_items(user_id);
CREATE INDEX idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX idx_batch_participants_batch_id ON batch_participants(batch_id);
CREATE INDEX idx_preorder_bookings_user_id ON preorder_bookings(user_id);
CREATE INDEX idx_affiliate_payouts_user_id ON affiliate_payouts(user_id);
CREATE INDEX idx_affiliate_payouts_status ON affiliate_payouts(status);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Atomically increment preorder quota_taken and return the booking
-- Raises exception if quota is full, preventing duplicates
CREATE OR REPLACE FUNCTION book_preorder(
  p_preorder_id UUID,
  p_user_id     UUID,
  p_payment_type TEXT,
  p_amount_paid  INTEGER,
  p_amount_remaining INTEGER
)
RETURNS preorder_bookings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking preorder_bookings;
  v_quota_total INTEGER;
  v_quota_taken INTEGER;
BEGIN
  -- Lock the preorder row for update to prevent race conditions
  SELECT quota_total, quota_taken
  INTO v_quota_total, v_quota_taken
  FROM preorders
  WHERE id = p_preorder_id AND active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preorder tidak ditemukan atau sudah tidak aktif';
  END IF;

  IF v_quota_taken >= v_quota_total THEN
    RAISE EXCEPTION 'Quota sudah penuh';
  END IF;

  -- Insert booking
  INSERT INTO preorder_bookings
    (preorder_id, user_id, payment_type, amount_paid, amount_remaining, status)
  VALUES
    (p_preorder_id, p_user_id, p_payment_type, p_amount_paid, p_amount_remaining, 'pending')
  RETURNING * INTO v_booking;

  -- Increment quota atomically
  UPDATE preorders
  SET quota_taken = quota_taken + 1
  WHERE id = p_preorder_id;

  RETURN v_booking;
END;
$$;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'customer'
  );
  -- Create default membership record
  INSERT INTO user_memberships (user_id, tier)
  VALUES (NEW.id, 'Free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update profile points balance when ledger changes
CREATE OR REPLACE FUNCTION sync_points_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET points_balance = NEW.balance_after
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure only one primary address per user
CREATE OR REPLACE FUNCTION enforce_single_primary_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE addresses
    SET is_primary = FALSE
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER sync_points_balance_trigger
  AFTER INSERT ON points_ledger
  FOR EACH ROW EXECUTE FUNCTION sync_points_balance();

CREATE TRIGGER enforce_single_primary_address_trigger
  BEFORE INSERT OR UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION enforce_single_primary_address();

-- updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_membership_plans_updated_at BEFORE UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_user_memberships_updated_at BEFORE UPDATE ON user_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_procurement_queue_updated_at BEFORE UPDATE ON procurement_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_support_notes_updated_at BEFORE UPDATE ON support_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_batch_shipments_updated_at BEFORE UPDATE ON batch_shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_preorders_updated_at BEFORE UPDATE ON preorders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_preorder_bookings_updated_at BEFORE UPDATE ON preorder_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_marketplaces_updated_at BEFORE UPDATE ON marketplaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_pricing_rules_updated_at BEFORE UPDATE ON pricing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_shipping_routes_updated_at BEFORE UPDATE ON shipping_routes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commission_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_staff" ON profiles FOR SELECT USING (auth_user_role() IN ('ops_admin', 'support', 'finance', 'super_admin'));
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_update_super_admin" ON profiles FOR UPDATE USING (auth_user_role() = 'super_admin');

-- USER MEMBERSHIPS
CREATE POLICY "memberships_select_own" ON user_memberships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "memberships_select_staff" ON user_memberships FOR SELECT USING (auth_user_role() IN ('finance', 'super_admin'));
CREATE POLICY "memberships_update_super_admin" ON user_memberships FOR ALL USING (auth_user_role() = 'super_admin');

-- ADDRESSES
CREATE POLICY "addresses_crud_own" ON addresses FOR ALL USING (auth.uid() = user_id);

-- QUOTATIONS
CREATE POLICY "quotations_select_own" ON quotations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "quotations_insert_own" ON quotations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "quotations_select_staff" ON quotations FOR SELECT USING (auth_user_role() IN ('ops_admin', 'super_admin'));
CREATE POLICY "quotations_update_staff" ON quotations FOR UPDATE USING (auth_user_role() IN ('ops_admin', 'super_admin'));

-- ORDERS
CREATE POLICY "orders_select_own" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_select_staff" ON orders FOR SELECT USING (auth_user_role() IN ('ops_admin', 'support', 'finance', 'super_admin'));
CREATE POLICY "orders_update_staff" ON orders FOR UPDATE USING (auth_user_role() IN ('ops_admin', 'super_admin'));

-- ORDER TRACKING
CREATE POLICY "order_tracking_select_own" ON order_tracking FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_tracking.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "order_tracking_select_staff" ON order_tracking FOR SELECT
  USING (auth_user_role() IN ('ops_admin', 'support', 'super_admin'));
CREATE POLICY "order_tracking_insert_staff" ON order_tracking FOR INSERT
  WITH CHECK (auth_user_role() IN ('ops_admin', 'super_admin'));

-- PAYMENTS
CREATE POLICY "payments_select_own" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payments_insert_own" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payments_select_finance" ON payments FOR SELECT USING (auth_user_role() IN ('finance', 'super_admin'));
CREATE POLICY "payments_update_finance" ON payments FOR UPDATE USING (auth_user_role() IN ('finance', 'super_admin'));

-- REFUNDS
CREATE POLICY "refunds_select_own" ON refunds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "refunds_insert_own" ON refunds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "refunds_all_finance" ON refunds FOR ALL USING (auth_user_role() IN ('finance', 'super_admin'));

-- POINTS LEDGER
CREATE POLICY "points_select_own" ON points_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "points_select_finance" ON points_ledger FOR SELECT USING (auth_user_role() IN ('finance', 'super_admin'));
CREATE POLICY "points_insert_system" ON points_ledger FOR INSERT WITH CHECK (auth_user_role() IN ('ops_admin', 'finance', 'super_admin'));

-- PROCUREMENT QUEUE
CREATE POLICY "procurement_all_ops" ON procurement_queue FOR ALL USING (auth_user_role() IN ('ops_admin', 'super_admin'));

-- SUPPORT NOTES
CREATE POLICY "support_notes_select_own" ON support_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "support_notes_all_support" ON support_notes FOR ALL USING (auth_user_role() IN ('support', 'ops_admin', 'super_admin'));

-- BATCH SHIPMENTS
CREATE POLICY "batch_shipments_select_all" ON batch_shipments FOR SELECT USING (TRUE);
CREATE POLICY "batch_shipments_all_super" ON batch_shipments FOR ALL USING (auth_user_role() = 'super_admin');

-- BATCH PARTICIPANTS
CREATE POLICY "batch_participants_select_own" ON batch_participants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "batch_participants_insert_own" ON batch_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "batch_participants_select_staff" ON batch_participants FOR SELECT USING (auth_user_role() IN ('ops_admin', 'super_admin'));

-- PRE-ORDERS
CREATE POLICY "preorders_select_all" ON preorders FOR SELECT USING (active = TRUE);
CREATE POLICY "preorders_all_super" ON preorders FOR ALL USING (auth_user_role() = 'super_admin');

-- PRE-ORDER BOOKINGS
CREATE POLICY "preorder_bookings_crud_own" ON preorder_bookings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "preorder_bookings_select_staff" ON preorder_bookings FOR SELECT USING (auth_user_role() IN ('ops_admin', 'finance', 'super_admin'));

-- WISHLIST ITEMS
CREATE POLICY "wishlist_crud_own" ON wishlist_items FOR ALL USING (auth.uid() = user_id);

-- PRICE ALERTS
CREATE POLICY "price_alerts_crud_own" ON price_alerts FOR ALL USING (auth.uid() = user_id);

-- TRACKING EXCEPTIONS
CREATE POLICY "tracking_exceptions_select_own" ON tracking_exceptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tracking_exceptions_all_ops" ON tracking_exceptions FOR ALL USING (auth_user_role() IN ('ops_admin', 'super_admin'));

-- SCRAPER FAILURES
CREATE POLICY "scraper_failures_select_ops" ON scraper_failures FOR SELECT USING (auth_user_role() IN ('ops_admin', 'super_admin'));
CREATE POLICY "scraper_failures_all_super" ON scraper_failures FOR ALL USING (auth_user_role() = 'super_admin');

-- QUOTE APPROVALS
CREATE POLICY "quote_approvals_all_ops" ON quote_approvals FOR ALL USING (auth_user_role() IN ('ops_admin', 'super_admin'));

-- MEMBERSHIP PLANS (public read)
CREATE POLICY "membership_plans_select_all" ON membership_plans FOR SELECT USING (TRUE);
CREATE POLICY "membership_plans_all_super" ON membership_plans FOR ALL USING (auth_user_role() = 'super_admin');

-- MARKETPLACES (public read)
CREATE POLICY "marketplaces_select_all" ON marketplaces FOR SELECT USING (active = TRUE);
CREATE POLICY "marketplaces_all_super" ON marketplaces FOR ALL USING (auth_user_role() = 'super_admin');

-- PRICING RULES
CREATE POLICY "pricing_rules_all_super" ON pricing_rules FOR ALL USING (auth_user_role() = 'super_admin');

-- FEE SETTINGS
CREATE POLICY "fee_settings_all_super" ON fee_settings FOR ALL USING (auth_user_role() = 'super_admin');

-- SHIPPING ROUTES (public read)
CREATE POLICY "shipping_routes_select_all" ON shipping_routes FOR SELECT USING (active = TRUE);
CREATE POLICY "shipping_routes_all_super" ON shipping_routes FOR ALL USING (auth_user_role() = 'super_admin');

-- AFFILIATE COMMISSION TIERS (public read)
CREATE POLICY "affiliate_tiers_select_all" ON affiliate_commission_tiers FOR SELECT USING (TRUE);
CREATE POLICY "affiliate_tiers_all_super" ON affiliate_commission_tiers FOR ALL USING (auth_user_role() = 'super_admin');

-- AFFILIATE PAYOUTS
CREATE POLICY "affiliate_payouts_select_own" ON affiliate_payouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "affiliate_payouts_all_finance" ON affiliate_payouts FOR ALL USING (auth_user_role() IN ('finance', 'super_admin'));

-- AI SETTINGS
CREATE POLICY "ai_settings_all_super" ON ai_settings FOR ALL USING (auth_user_role() = 'super_admin');
