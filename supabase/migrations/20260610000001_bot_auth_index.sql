-- ============================================================
-- MyBagasi - Bot Auth Index & Token Rotation
-- ============================================================

-- Index for fast lookup by email (used by bot /login)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Function: generate new telegram_token for existing user
CREATE OR REPLACE FUNCTION rotate_telegram_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  UPDATE profiles
  SET telegram_token = v_token, updated_at = NOW()
  WHERE id = p_user_id;
  RETURN v_token;
END;
$$;
