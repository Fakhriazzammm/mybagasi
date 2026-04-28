-- ============================================================
-- Landing Page Content Tables
-- ============================================================

-- Product categories shown on landing page
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  emoji TEXT NOT NULL DEFAULT '📦',
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer testimonials shown on landing page
CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FAQ items shown on landing page
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RLS Policies (public read, admin write)
-- ============================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public can read categories" ON categories FOR SELECT USING (active = TRUE);
CREATE POLICY "Public can read testimonials" ON testimonials FOR SELECT USING (active = TRUE);
CREATE POLICY "Public can read faqs" ON faqs FOR SELECT USING (active = TRUE);

-- Auth users with admin roles can manage
CREATE POLICY "Admin can manage categories" ON categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'ops_admin')));
CREATE POLICY "Admin can manage testimonials" ON testimonials FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'ops_admin')));
CREATE POLICY "Admin can manage faqs" ON faqs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'ops_admin')));

-- ============================================================
-- Seed Data
-- ============================================================

-- Categories
INSERT INTO categories (emoji, name, sort_order) VALUES
('👟', 'Sneakers',       1),
('🎮', 'Game & Anime',   2),
('💄', 'Kosmetik',       3),
('👜', 'Fashion',        4),
('📷', 'Kamera',         5),
('🍵', 'Snack & Teh',    6),
('🎸', 'Musik & Vinyl',  7),
('📚', 'Buku & Manga',   8);

-- Testimonials
INSERT INTO testimonials (name, city, text, rating, sort_order) VALUES
('Rina A.', 'Jakarta',  'Cuma kirim link Mercari, 10 menit langsung dapat quote. Sneakers sampai cuma 9 hari!', 5, 1),
('Dimas P.', 'Bandung',  'Suka banget AI shopper-nya. Dia carikan figure langka padahal aku cuma kasih foto.', 5, 2),
('Citra L.', 'Surabaya', 'Batch shipping ngebantu banget. Hemat 40% ongkir, barang aman semua.', 5, 3);

-- FAQs
INSERT INTO faqs (question, answer, sort_order) VALUES
('Berapa lama barang sampai?', 'Rata-rata 7–14 hari kerja sejak pembayaran. Bergantung pada metode pengiriman dan bea cukai.', 1),
('Marketplace Jepang apa saja yang didukung?', 'Amazon JP, Rakuten, Mercari, Yahoo Auction, Zozotown, Map Camera, Ippodo, dan toko brand resmi. Bisa request marketplace lain.', 2),
('Apakah bisa beli barang yang tidak ada link-nya?', 'Bisa! Kirim foto atau deskripsi, AI personal shopper kami akan bantu carikan di marketplace Jepang.', 3),
('Bagaimana cara hitung total biayanya?', 'Total = harga produk + kurs JPY → IDR + fee jasa + ongkir Jepang → Indo + pajak/bea + biaya last-mile. Semua transparan di quotation.', 4),
('Bagaimana kalau barang tidak sesuai?', 'Kami foto bukti sebelum kirim dari Jepang. Jika ada masalah pengiriman, kami bantu klaim asuransi pengiriman.', 5),
('Apakah aman bayar di MyBagasi?', 'Iya. Pembayaran via Virtual Account bank resmi & e-wallet melalui payment gateway Mayar. Dana dikelola aman.', 6);
