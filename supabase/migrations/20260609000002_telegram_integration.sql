-- ============================================================
-- MyBagasi - Telegram Bot Integration
-- ============================================================

-- Add Telegram columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE;

-- Generate unique tokens for existing users
DO $$
DECLARE
  u RECORD;
  token TEXT;
BEGIN
  FOR u IN SELECT id FROM profiles WHERE telegram_token IS NULL
  LOOP
    token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    UPDATE profiles SET telegram_token = token WHERE id = u.id;
  END LOOP;
END $$;

-- Auto-generate token for new users
CREATE OR REPLACE FUNCTION generate_telegram_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW.telegram_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_telegram_token ON profiles;
CREATE TRIGGER trg_generate_telegram_token
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.telegram_token IS NULL)
  EXECUTE FUNCTION generate_telegram_token();

-- Index for fast lookup by telegram_id
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_token ON profiles(telegram_token);
