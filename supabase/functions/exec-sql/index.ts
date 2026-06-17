import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const sql = await req.text()
    if (!sql || sql.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Empty SQL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Split SQL into individual statements by semicolon
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"))

    const results: any[] = []

    for (const stmt of statements) {
      try {
        // Try calling via rpc if it exists
        const { error } = await supabase.rpc("exec_raw_sql", { sql_text: stmt + ";" })
        if (!error) {
          results.push({ statement: stmt.slice(0, 80), method: "rpc", success: true })
          continue
        }
      } catch {
        // rpc not available, fall through
      }

      // Direct PostgreSQL execution via raw query
      // Use the service_role key to call the query endpoint
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Prefer": "params=single-object, tx=open",
        },
        body: JSON.stringify({ query: stmt }),
      })

      if (response.ok) {
        results.push({ statement: stmt.slice(0, 80), method: "postgrest", success: true })
      } else {
        const text = await response.text()
        results.push({ statement: stmt.slice(0, 80), method: "postgrest", success: false, error: text.slice(0, 200) })
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
