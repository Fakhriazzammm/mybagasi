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
  
  const botSecret = Deno.env.get("BOT_SECRET");
  if (req.headers.get("x-bot-secret") !== botSecret) {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    const { name, email, password }: {name:string;email:string;password:string} = await req.json();
    
    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: "name, email, password required" }), { 
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // Wait briefly for trigger to create profile
    await new Promise(r => setTimeout(r, 1000));
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, telegram_token")
      .eq("id", data.user.id)
      .single();

    return new Response(JSON.stringify({
      user_id: data.user.id,
      telegram_token: profile?.telegram_token,
      email: data.user.email,
    }), { headers: { "Content-Type": "application/json" } });
    
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { 
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
});
