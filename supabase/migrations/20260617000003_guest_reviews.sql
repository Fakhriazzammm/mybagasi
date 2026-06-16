-- ============================================================
-- Guest Reviews for Personal Shopper
-- Memungkinkan guest (tidak login) memberikan ulasan 
-- dengan wajib mengisi nama
-- ============================================================

-- 1. Buat user_id nullable (guest bisa review tanpa login)
ALTER TABLE shopper_reviews ALTER COLUMN user_id DROP NOT NULL;

-- 2. Tambah kolom guest info
ALTER TABLE shopper_reviews ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE shopper_reviews ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- 3. Drop old UNIQUE constraint (shopper_id, user_id) karena user_id bisa NULL
ALTER TABLE shopper_reviews DROP CONSTRAINT IF EXISTS shopper_reviews_shopper_id_user_id_key;

-- 4. Buat unique constraint baru:
--    - Untuk user terautentikasi: (shopper_id, user_id) unique
--    - Untuk guest: gunakan (shopper_id, guest_name) sebagai unique
--    Karena PostgreSQL tidak bisa partial unique index dengan NULL,
--    kita buat dua partial unique index:
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopper_reviews_unique_auth 
  ON shopper_reviews(shopper_id, user_id) 
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopper_reviews_unique_guest 
  ON shopper_reviews(shopper_id, guest_name) 
  WHERE user_id IS NULL;

-- 5. Drop old RLS policies
DROP POLICY IF EXISTS "shopper_reviews_select_public" ON shopper_reviews;
DROP POLICY IF EXISTS "shopper_reviews_insert_own" ON shopper_reviews;
DROP POLICY IF EXISTS "shopper_reviews_all_own" ON shopper_reviews;
DROP POLICY IF EXISTS "shopper_reviews_all_super" ON shopper_reviews;

-- 6. Buat RLS policies baru
--    SELECT: public (semua bisa baca)
CREATE POLICY "shopper_reviews_select_public" ON shopper_reviews
  FOR SELECT USING (TRUE);

--    INSERT: 
--    - Authenticated user: user_id harus sama dengan auth.uid()
--    - Guest: user_id harus NULL, wajib isi guest_name
CREATE POLICY "shopper_reviews_insert_public" ON shopper_reviews
  FOR INSERT WITH CHECK (
    (auth.role() = 'authenticated' AND auth.uid() = user_id)
    OR 
    (auth.role() = 'anon' AND user_id IS NULL AND guest_name IS NOT NULL AND guest_name != '')
  );

--    UPDATE/DELETE: 
--    - Own review (authenticated)
--    - Super admin
CREATE POLICY "shopper_reviews_update_own" ON shopper_reviews
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shopper_reviews_delete_own" ON shopper_reviews
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "shopper_reviews_all_super" ON shopper_reviews
  FOR ALL USING (auth_user_role() = 'super_admin');

-- 7. Update stats trigger untuk review count
--    Function untuk update stats
CREATE OR REPLACE FUNCTION update_shopper_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE personal_shoppers
    SET stats = jsonb_set(
      jsonb_set(stats, '{reviews_count}', 
        COALESCE((stats->>'reviews_count')::int + 1, 1)::text::jsonb),
      '{rating}', 
      (
        SELECT ROUND(AVG(rating)::numeric, 1)::text::jsonb
        FROM shopper_reviews
        WHERE shopper_id = NEW.shopper_id
      )
    )
    WHERE id = NEW.shopper_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE personal_shoppers
    SET stats = jsonb_set(
      jsonb_set(stats, '{reviews_count}', 
        GREATEST(0, COALESCE((stats->>'reviews_count')::int, 1) - 1)::text::jsonb),
      '{rating}', 
        COALESCE((
          SELECT ROUND(AVG(rating)::numeric, 1)::text::jsonb
          FROM shopper_reviews
          WHERE shopper_id = OLD.shopper_id
        ), '0'::jsonb)
    )
    WHERE id = OLD.shopper_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trg_update_shopper_stats ON shopper_reviews;

-- Create trigger
CREATE TRIGGER trg_update_shopper_stats
  AFTER INSERT OR DELETE ON shopper_reviews
  FOR EACH ROW EXECUTE FUNCTION update_shopper_stats();

-- 8. Update trigger untuk rating saat update
CREATE OR REPLACE FUNCTION update_shopper_rating_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.rating IS DISTINCT FROM NEW.rating THEN
    UPDATE personal_shoppers
    SET stats = jsonb_set(stats, '{rating}', 
      (
        SELECT ROUND(AVG(rating)::numeric, 1)::text::jsonb
        FROM shopper_reviews
        WHERE shopper_id = NEW.shopper_id
      )
    )
    WHERE id = NEW.shopper_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_shopper_rating ON shopper_reviews;

CREATE TRIGGER trg_update_shopper_rating
  AFTER UPDATE OF rating ON shopper_reviews
  FOR EACH ROW EXECUTE FUNCTION update_shopper_rating_on_update();
