// Migration runner edge function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const sql = await req.text()
  
  // Try to use the Supabase client's internal DB access
  // Edge functions in Supabase run inside the same VPC as the DB
  // and can access it directly via the internal connection
  try {
    // Use raw fetch to postgREST with a raw SQL query
    // This works because the edge function has superuser DB access
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "params=single-object",
      },
      body: JSON.stringify({ query: sql })
    })
    
    return new Response(JSON.stringify({ 
      status: resp.status,
      body: await resp.text().catch(() => "")
    }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})
