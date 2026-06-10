import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  
  // Auth: verify bot secret OR user JWT
  const botSecret = Deno.env.get("BOT_SECRET");
  const authHeader = req.headers.get("Authorization") || "";
  const xBotSecret = req.headers.get("x-bot-secret") || "";
  
  let userId: string | null = null;
  
  if (xBotSecret === botSecret) {
    // Called by bot with secret — trust the user_id in body
    const { user_id, key, value } = await req.json();
    if (!user_id || !key) {
      return new Response(JSON.stringify({ error: "user_id and key required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    userId = user_id;
    
    const { data, error } = await supabase.rpc("upsert_memory", {
      p_user_id: userId,
      p_key: key,
      p_value: value,
    });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { "Content-Type": "application/json" }
    });
    
  } else if (authHeader.startsWith("Bearer ")) {
    // Called by user with JWT — extract user from JWT
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }
    
    const { key, value } = await req.json();
    if (!key) {
      return new Response(JSON.stringify({ error: "key required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    
    const { data, error } = await supabase.rpc("upsert_memory", {
      p_user_id: user.id,
      p_key: key,
      p_value: value,
    });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { "Content-Type": "application/json" }
    });
    
  } else {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }
});
