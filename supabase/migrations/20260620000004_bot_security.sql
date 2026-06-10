-- ============================================================
-- MyBagasi - Bot Security: RLS & Bot Role
-- ============================================================

-- Add 'bot' role to user_role enum (safe - idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'bot' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'bot';
  END IF;
END $$;

-- ============================================================
-- Bot JWT Storage (optional - for session persistence)
-- ============================================================
-- Kalau bot perlu menyimpan JWT user agar bisa digunakan
-- di multiple turn percakapan, tambah kolom di profiles.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bot_jwt TEXT,
  ADD COLUMN IF NOT EXISTS bot_refresh_token TEXT;

-- ============================================================
-- RLS: Bot-specific policies (if needed)
-- ============================================================
-- Bot login sebagai user, jadi RLS existing sudah cukup.
-- Tapi untuk admin operations via Edge Function, kita perlu
-- memastikan Edge Function bisa INSERT dengan user context.

-- Policy untuk memungkinkan user INSERT quotation dengan auth.uid()
-- (sudah ada: quotations_insert_own WITH CHECK (auth.uid() = user_id))

-- ============================================================
-- Function: refresh bot JWT
-- ============================================================
-- Helper untuk bot me-refresh JWT user dari refresh_token
CREATE OR REPLACE FUNCTION refresh_bot_session(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refresh_token TEXT;
BEGIN
  SELECT bot_refresh_token INTO v_refresh_token
  FROM profiles WHERE id = p_user_id;
  
  IF v_refresh_token IS NULL THEN
    RETURN jsonb_build_object('error', 'No refresh token');
  END IF;
  
  -- Return the refresh token for the bot to call Supabase Auth
  RETURN jsonb_build_object('refresh_token', v_refresh_token);
END;
$$;
