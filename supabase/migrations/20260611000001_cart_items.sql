-- Migration: Create cart_items table for MyBagasi cart system
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Create cart_items table
CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    price_jpy INTEGER NOT NULL,
    url TEXT,
    image_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    source TEXT DEFAULT 'telegram_bot',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index for faster user cart lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);

-- 3. Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_cart_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cart_items_updated_at ON cart_items;
CREATE TRIGGER trg_cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cart_items_updated_at();

-- 4. Enable RLS
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Users can only see their own cart
CREATE POLICY "Users can view own cart items"
    ON cart_items FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own cart items
CREATE POLICY "Users can insert own cart items"
    ON cart_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own cart items
CREATE POLICY "Users can update own cart items"
    ON cart_items FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own cart items
CREATE POLICY "Users can delete own cart items"
    ON cart_items FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Helper function: get cart summary for a user
CREATE OR REPLACE FUNCTION get_cart_summary(p_user_id UUID)
RETURNS TABLE(
    total_items BIGINT,
    total_jpy BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT,
        COALESCE(SUM(price_jpy * quantity), 0)::BIGINT
    FROM cart_items
    WHERE user_id = p_user_id;
END;
$$;

-- 7. Helper function: clear cart after checkout
CREATE OR REPLACE FUNCTION clear_user_cart(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cart_items WHERE user_id = p_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
