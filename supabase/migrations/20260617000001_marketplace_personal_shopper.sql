-- ============================================================
-- Marketplace Personal Shopper
-- Fitur marketplace untuk personal shopper yang sudah bergabung
-- Terinspirasi dari Fiverr / Upwork
-- ============================================================

-- Verification badge type
-- gold = Centang Emas (verified premium)
-- blue = Centang Biru (verified)
-- none = Belum terverifikasi
CREATE TYPE shopper_verification_type AS ENUM ('none', 'gold', 'blue');

-- ============================================================
-- PERSONAL SHOPPERS
-- ============================================================
CREATE TABLE personal_shoppers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT,
  description TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  verification shopper_verification_type NOT NULL DEFAULT 'none',
  services TEXT[] DEFAULT '{}',
  pricing_description TEXT,
  starting_price INTEGER, -- IDR
  location TEXT,
  website TEXT,
  social_links JSONB DEFAULT '{}',
  stats JSONB DEFAULT '{"orders_completed": 0, "rating": 0, "reviews_count": 0}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SHOPPER REVIEWS
-- ============================================================
CREATE TABLE shopper_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopper_id UUID NOT NULL REFERENCES personal_shoppers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shopper_id, user_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_personal_shoppers_verification ON personal_shoppers(verification);
CREATE INDEX idx_personal_shoppers_active ON personal_shoppers(is_active);
CREATE INDEX idx_personal_shoppers_featured ON personal_shoppers(featured);
CREATE INDEX idx_personal_shoppers_display_order ON personal_shoppers(display_order);
CREATE INDEX idx_shopper_reviews_shopper_id ON shopper_reviews(shopper_id);
CREATE INDEX idx_shopper_reviews_user_id ON shopper_reviews(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE personal_shoppers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopper_reviews ENABLE ROW LEVEL SECURITY;

-- Personal Shoppers: public read (active only), super admin full control
CREATE POLICY "personal_shoppers_select_public" ON personal_shoppers
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "personal_shoppers_all_super" ON personal_shoppers
  FOR ALL USING (auth_user_role() = 'super_admin');

-- Reviews: public can read, authenticated users can manage own
CREATE POLICY "shopper_reviews_select_public" ON shopper_reviews
  FOR SELECT USING (TRUE);

CREATE POLICY "shopper_reviews_insert_own" ON shopper_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shopper_reviews_all_own" ON shopper_reviews
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "shopper_reviews_all_super" ON shopper_reviews
  FOR ALL USING (auth_user_role() = 'super_admin');

-- ============================================================
-- TRIGGERS (updated_at)
-- ============================================================
CREATE TRIGGER update_personal_shoppers_updated_at BEFORE UPDATE ON personal_shoppers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
