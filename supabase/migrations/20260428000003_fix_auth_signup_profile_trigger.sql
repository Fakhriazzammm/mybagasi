-- ============================================================
-- Fix Supabase Auth signup profile trigger
-- ============================================================
-- Supabase Auth surfaces trigger failures as "Database error saving new user".
-- Keep this trigger idempotent and schema-qualified so signup/login remains reliable.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_name TEXT;
  v_email TEXT;
BEGIN
  v_email := COALESCE(NEW.email, '');
  v_name := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(v_email, '@', 1)
  )), '');

  INSERT INTO public.profiles (id, name, email, role, tier, status, points_balance)
  VALUES (
    NEW.id,
    COALESCE(v_name, 'User'),
    v_email,
    'customer',
    'Free',
    'active',
    0
  )
  ON CONFLICT (id) DO UPDATE
  SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.profiles.name),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
      updated_at = NOW();

  INSERT INTO public.user_memberships (user_id, tier)
  VALUES (NEW.id, 'Free')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
