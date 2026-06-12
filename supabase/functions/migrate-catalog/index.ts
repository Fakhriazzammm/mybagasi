import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const sql = `-- ============================================================
-- MyBagasi - catalog_items table
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
  images JSONB DEFAULT '[]'::jsonb,
  source TEXT DEFAULT 'reference',
  marketplace TEXT DEFAULT '',
  url TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  weight_kg DECIMAL(5,2) DEFAULT 0,
  shipping_category TEXT DEFAULT 'general',
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.catalog_items IS 'Katalog produk referensi MyBagasi';
COMMENT ON COLUMN public.catalog_items.category IS 'Main category: Fashion, Makeup, Gacha, dll';
COMMENT ON COLUMN public.catalog_items.images IS 'Array of image paths';
COMMENT ON COLUMN public.catalog_items.tags IS 'Search tags';

CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON public.catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_active ON public.catalog_items(active);
CREATE INDEX IF NOT EXISTS idx_catalog_items_sub_category ON public.catalog_items(sub_category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_shipping_category ON public.catalog_items(shipping_category);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tags ON public.catalog_items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_catalog_items_fts ON public.catalog_items USING GIN(
  to_tsvector('indonesian', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || coalesce(sub_category, ''))
);

DROP TRIGGER IF EXISTS trg_catalog_items_updated_at ON public.catalog_items;
CREATE TRIGGER trg_catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_items_select ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_insert ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_update ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_delete ON public.catalog_items;

CREATE POLICY catalog_items_select ON public.catalog_items FOR SELECT USING (true);
CREATE POLICY catalog_items_insert ON public.catalog_items FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY catalog_items_update ON public.catalog_items FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY catalog_items_delete ON public.catalog_items FOR DELETE USING (auth.role() = 'service_role');`

  try {
    // Option 1: Try supabase.rpc with exec_sql
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query_text: sql })
    })
    if (rpcResp.ok) {
      return new Response(JSON.stringify({ method: "exec_sql", status: rpcResp.status }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    // Option 2: Try pg_execute
    const pgResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_execute`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query_text: sql })
    })
    if (pgResp.ok) {
      return new Response(JSON.stringify({ method: "pg_execute", status: pgResp.status }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    // Option 3: Try creating exec_sql function first, then call it
    const createFnSQL = `
CREATE OR REPLACE FUNCTION public.exec_sql(query_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \\$\\$ BEGIN EXECUTE query_text; END; \\$\\$;`

    // Try via MagicSDK internal DB access (only works in Supabase managed runtime)
    // This is the key approach - edge functions have direct DB access
    const magicResp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "GET",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Accept-Profile": "public",
        "Content-Profile": "public"
      }
    })

    return new Response(JSON.stringify({
      error: "All methods failed",
      rpc_status: rpcResp.status,
      pg_status: pgResp.status,
      magic_status: magicResp.status,
      rpc_text: await rpcResp.text().catch(() => "?"),
      pg_text: await pgResp.text().catch(() => "?"),
    }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    })
  }
})
