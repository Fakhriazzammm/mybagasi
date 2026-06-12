-- Create pricing_config table for admin-configurable pricing
CREATE TABLE IF NOT EXISTS public.pricing_config (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default data
INSERT INTO public.pricing_config (key, value) VALUES
('exchange_rate', '{"rate": 105, "source": "hardcoded", "auto_update": true, "last_fetched": null}'),
('profit_tiers', '{"tiers": [
    {"min": 0, "max": 999999, "profit": 100000},
    {"min": 1000000, "max": 2999999, "profit": 300000},
    {"min": 3000000, "max": 4999999, "profit": 500000},
    {"min": 5000000, "max": 9999999, "profit": 1000000},
    {"min": 10000000, "max": 999999999, "profit": 2000000}
]}'),
('shipping_cost', '{"cost": 250000, "description": "Ongkir Jepang ke Indonesia"}'),
('tax_rate', '{"rate": 0.08, "description": "Pajak & bea cukai 8%"}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Enable RLS
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- RLS policies: readable by all, writable only by service_role
DROP POLICY IF EXISTS pricing_config_select ON public.pricing_config;
DROP POLICY IF EXISTS pricing_config_insert ON public.pricing_config;
DROP POLICY IF EXISTS pricing_config_update ON public.pricing_config;
DROP POLICY IF EXISTS pricing_config_delete ON public.pricing_config;

CREATE POLICY pricing_config_select ON public.pricing_config
    FOR SELECT USING (true);

CREATE POLICY pricing_config_insert ON public.pricing_config
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY pricing_config_update ON public.pricing_config
    FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY pricing_config_delete ON public.pricing_config
    FOR DELETE USING (auth.role() = 'service_role');
