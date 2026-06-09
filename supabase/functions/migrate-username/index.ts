// Temporary migration function - run SQL to add username column
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || ""
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  )

  // Run migration SQL
  const sql = `
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
    
    UPDATE profiles SET username = LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(name, '[^a-zA-Z0-9\\s]', '-', 'g'),
          '\\s+', '-', 'g'
        ),
        '-+', '-', 'g'
      )
    ) WHERE username IS NULL;
    
    UPDATE profiles SET username = RTRIM(username, '-') WHERE username IS NOT NULL AND username LIKE '%-';
    
    WITH dupes AS (
      SELECT id FROM profiles p1
      WHERE (SELECT COUNT(*) FROM profiles p2 WHERE p2.username = p1.username AND p2.id != p1.id) > 0
    )
    UPDATE profiles SET username = username || '-' || SUBSTR(id::text, 1, 8)
    FROM dupes WHERE profiles.id = dupes.id;
    
    ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
  `

  try {
    // Execute raw SQL using run_sql or direct query
    const { data, error } = await supabase.rpc("exec_sql", { query_text: sql })
    if (error) {
      // Try alternative: use raw SQL via pg_dump-like approach
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/pg_execute`, {
        method: "POST",
        headers: {
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query_text: sql }),
      })
      const result = await resp.text()
      return new Response(JSON.stringify({ method: "pg_execute", status: resp.status, result }), { headers: { "Content-Type": "application/json" } })
    }
    return new Response(JSON.stringify({ success: true, result: data }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
