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

    // Execute raw SQL via the Management API using service_role key
    // The service_role key can act as a PAT for the Management API
    try {
      const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0]
      const mgmtResp = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        }
      )
      
      if (mgmtResp.ok) {
        const text = await mgmtResp.text()
        return new Response(JSON.stringify({
          method: "mgmt_api",
          status: mgmtResp.status,
          result: text ? text.slice(0, 500) : "ok",
        }), {
          headers: { "Content-Type": "application/json" },
        })
      }
    } catch (_) {
      // Fallback below
    }

    // Fallback: Use supabase.rpc with a temporary SQL execution function
    // First try to create the function if it doesn't exist
    const { error: rpcError } = await supabase.rpc("exec_raw_sql", { sql_text: sql })
    if (!rpcError) {
      return new Response(JSON.stringify({ method: "rpc", success: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({
      error: "All methods failed",
      details: String(rpcError),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
