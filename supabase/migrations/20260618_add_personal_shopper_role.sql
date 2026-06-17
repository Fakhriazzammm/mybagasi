-- Add user_id column to personal_shoppers table
ALTER TABLE personal_shoppers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_personal_shoppers_user_id ON personal_shoppers(user_id);
