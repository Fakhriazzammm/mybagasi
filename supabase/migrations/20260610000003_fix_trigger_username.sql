-- Fix handle_new_user() trigger to include username column
-- username is NOT NULL, so the trigger must generate it

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_name TEXT;
  v_email TEXT;
  v_username TEXT;
BEGIN
  v_email := COALESCE(NEW.email, '');
  v_name := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(v_email, '@', 1)
  )), '');
  
  -- Generate username from name
  v_username := LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE(v_name, 'user'), '[^a-zA-Z0-9\\s]', '-', 'g'),
      '\\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  ));
  v_username := RTRIM(v_username, '-');
  IF v_username IS NULL OR v_username = '' THEN
    v_username := 'user-' || SUBSTR(NEW.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, name, email, username, role, tier, status, points_balance)
  VALUES (
    NEW.id,
    COALESCE(v_name, 'User'),
    v_email,
    v_username,
    'customer',
    'Free',
    'active',
    0
  )
  ON CONFLICT (id) DO UPDATE
  SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.profiles.name),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
      username = COALESCE(NULLIF(EXCLUDED.username, ''), public.profiles.username),
      updated_at = NOW();

  INSERT INTO public.user_memberships (user_id, tier)
  VALUES (NEW.id, 'Free')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
