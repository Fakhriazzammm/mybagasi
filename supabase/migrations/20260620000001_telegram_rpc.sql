-- ============================================================
-- MyBagasi - Telegram RPC Functions
-- ============================================================

-- ============================================================
-- rotate_telegram_token(p_user_id UUID) RETURNS TEXT
-- Generates a new 12-char uppercase token for a user's profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.rotate_telegram_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate a 12-character uppercase token
  v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  -- Update the profile with the new token
  UPDATE profiles
  SET telegram_token = v_token,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Raise notice if no row was updated (user doesn't exist)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user_id: %', p_user_id;
  END IF;

  RETURN v_token;
END;
$$;

-- ============================================================
-- link_telegram(p_user_id UUID, p_telegram_id BIGINT) RETURNS BOOLEAN
-- Links a Telegram chat/account ID to a user's profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_telegram(p_user_id UUID, p_telegram_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if telegram_id is already linked to another user
  IF EXISTS (SELECT 1 FROM profiles WHERE telegram_id = p_telegram_id AND id <> p_user_id) THEN
    RAISE EXCEPTION 'Telegram ID % is already linked to another account', p_telegram_id;
  END IF;

  -- Update the profile
  UPDATE profiles
  SET telegram_id = p_telegram_id,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user_id: %', p_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- Indexes (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_token ON profiles(telegram_token);
