-- Add username column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Generate username from name for existing users
-- Lowercase, replace spaces/special chars with hyphens, remove consecutive hyphens
UPDATE profiles 
SET username = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(name, '[^a-zA-Z0-9\\s]', '-', 'g'),
      '\\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  )
)
WHERE username IS NULL;

-- Remove trailing hyphens
UPDATE profiles
SET username = RTRIM(username, '-')
WHERE username IS NOT NULL AND username LIKE '%-';

-- Handle duplicate usernames by appending suffix
UPDATE profiles p1
SET username = p1.username || '-' || SUBSTR(p1.id::text, 1, 8)
WHERE (
  SELECT COUNT(*) FROM profiles p2 
  WHERE p2.username = p1.username AND p2.id != p1.id
) > 0;

-- Make username NOT NULL now that all rows have values
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;

-- Add unique index (already covered by UNIQUE constraint above)
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
