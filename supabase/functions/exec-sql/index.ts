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

    // Execute raw SQL via the postgREST API with a raw SQL query
    // This uses the service_role key to bypass RLS
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Prefer": "params=single-object, tx=open",
        },
        body: JSON.stringify({}),
      }
    )

    // Try the pg-native approach via Supabase management
    // The service_role key has access via the SQL API by using
    // a raw HTTP connection with the postgREST
    
    // Alternative: Use the Data API with a function call that executes SQL
    // We'll create a temporary SQL function and call it
    const createFnResp = await supabase.rpc("exec_raw_sql", { sql_text: sql })
    
    return new Response(JSON.stringify({
      success: true,
      method: "rpc_exec_raw_sql",
      result: createFnResp,
    }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    // Fallback: try direct fetch to Supabase Management API
    try {
      const url = "https://api.supabase.com/v1/projects/gvbikxcnlmlcrbixwpxl/database/query"
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      const sql = await req.text()
      
      const mgmtResp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      })
      
      const mgmtBody = await mgmtResp.text()
      return new Response(JSON.stringify({
        method: "mgmt_api",
        status: mgmtResp.status,
        body: mgmtBody.slice(0, 500),
      }), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (e2) {
      return new Response(JSON.stringify({
        error: String(e),
        fallbackError: String(e2),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
  }
})
