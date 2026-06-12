-- ============================================================
-- MyBagasi - catalog_items table
-- Master product catalog for proxy shopping (Mercari, Rakuma, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    sub_category TEXT DEFAULT '',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price_jpy INTEGER,
    price_idr INTEGER,
    currency TEXT DEFAULT 'JPY',
    images JSONB DEFAULT '[]',
    source TEXT DEFAULT 'reference',
    marketplace TEXT DEFAULT '',
    url TEXT DEFAULT '',
    tags JSONB DEFAULT '[]',
    weight_kg DECIMAL(5,2) DEFAULT 0,
    shipping_category TEXT DEFAULT 'general',
    active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.catalog_items IS 'Master product catalog for proxy shopping';
COMMENT ON COLUMN public.catalog_items.category IS 'Main category: Fashion, Makeup, Gacha, etc.';
COMMENT ON COLUMN public.catalog_items.sub_category IS 'Sub-category: GU, Uniqlo, Chanel, etc.';
COMMENT ON COLUMN public.catalog_items.shipping_category IS 'Shipping category: fashion, elektronik, skincare, buku, food, general';
COMMENT ON COLUMN public.catalog_items.source IS 'Source type: reference, manual, import, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON public.catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_active ON public.catalog_items(active);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tags ON public.catalog_items USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_catalog_items_sub_category ON public.catalog_items(sub_category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_shipping_category ON public.catalog_items(shipping_category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_fts ON public.catalog_items
    USING GIN (to_tsvector('indonesian',
        coalesce(name, '') || ' ' ||
        coalesce(description, '') || ' ' ||
        coalesce(category, '') || ' ' ||
        coalesce(sub_category, '')
    ));

-- Auto-update updated_at
CREATE TRIGGER update_catalog_items_updated_at
    BEFORE UPDATE ON public.catalog_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

-- RLS policies: SELECT for all, INSERT/UPDATE/DELETE only for service_role
DROP POLICY IF EXISTS catalog_items_select ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_insert ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_update ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_delete ON public.catalog_items;

CREATE POLICY catalog_items_select ON public.catalog_items
    FOR SELECT USING (true);

CREATE POLICY catalog_items_insert ON public.catalog_items
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY catalog_items_update ON public.catalog_items
    FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY catalog_items_delete ON public.catalog_items
    FOR DELETE USING (auth.role() = 'service_role');
