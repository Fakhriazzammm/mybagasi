-- Add last_active_at column for session expiry (24h inactivity)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing users to have last_active_at set
UPDATE profiles SET last_active_at = NOW() WHERE last_active_at IS NULL;
