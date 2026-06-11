import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.headers.get("x-bot-secret") !== Deno.env.get("BOT_SECRET")) {
    return new Response("Unauthorized", { status: 403 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Try raw SQL via rest/v1/ with custom query  
  // Supabase has a built-in /rest/v1/rpc/ that can call any function
  // But we need DDL. Let me use the fact that service_role can query any table.
  
  // Try via the postgREST with a custom header
  const sql = `
  CREATE TABLE IF NOT EXISTS bot_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, key)
  );
  `;

  // Use the Supabase SQL API: POST /rest/v1/ with SQL via "Prefer: tx=open" header
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": KEY,
      "Authorization": `Bearer ${KEY}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify({}),
  });

  let result: Record<string, unknown> = { method: "rest_post", status: resp.status };

  // Try alternative: use the supabase client approach
  // Using raw SQL through the client
  try {
    const createResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: "GET",
      headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` },
    });
    const rpcText = await createResp.text();
    result = { ...result, rpc_check: rpcText.slice(0, 200) };
  } catch (e) {
    result = { ...result, rpc_error: String(e) };
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" }
  });
});
