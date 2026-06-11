import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }
  
  const botSecret = Deno.env.get("BOT_SECRET");
  if (req.headers.get("x-bot-secret") !== botSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { action, email, profile_id, chat_id, token: input_token }: {
      action: string;
      email?: string;
      profile_id?: string;
      chat_id?: string;
      token?: string;
    } = await req.json();
    
    if (action === "lookup") {
      // Lookup user by email
      if (!email) {
        return new Response(JSON.stringify({ error: "email required" }), { 
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }
      
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, telegram_id, name")
        .eq("email", email.toLowerCase().trim())
        .limit(2);

      if (error) {
        return new Response(JSON.stringify({ error: "Database error" }), { 
          status: 500, headers: { "Content-Type": "application/json" }
        });
      }

      if (!profiles || profiles.length === 0) {
        return new Response(JSON.stringify({ found: false, message: "Email not registered" }), { 
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      if (profiles.length > 1) {
        return new Response(JSON.stringify({ found: false, message: "Multiple accounts" }), { 
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      const profile = profiles[0];
      return new Response(JSON.stringify({
        found: true,
        profile_id: profile.id,
        email: profile.email,
        telegram_id: profile.telegram_id,
        name: profile.name,
      }), { headers: { "Content-Type": "application/json" } });

    } else if (action === "generate_token") {
      // Generate telegram token via RPC
      if (!profile_id) {
        return new Response(JSON.stringify({ error: "profile_id required" }), { 
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      const { data, error } = await supabase.rpc("rotate_telegram_token", {
        p_user_id: profile_id,
      });

      if (error) {
        return new Response(JSON.stringify({ error: "Token generation failed" }), { 
          status: 500, headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        token: data?.token || data,
        profile_id,
      }), { headers: { "Content-Type": "application/json" } });

    } else if (action === "verify_and_link") {
      // Verify token and link telegram_id
      if (!profile_id || !chat_id || !input_token) {
        return new Response(JSON.stringify({ error: "profile_id, chat_id, token required" }), { 
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      // Verify token from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("telegram_token, telegram_id, id")
        .eq("id", profile_id)
        .single();

      if (profileError || !profile) {
        return new Response(JSON.stringify({ error: "Profile not found" }), { 
          status: 404, headers: { "Content-Type": "application/json" }
        });
      }

      if (profile.telegram_token?.toUpperCase() !== input_token.toUpperCase()) {
        return new Response(JSON.stringify({ success: false, message: "Invalid token" }), { 
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      // Check if telegram_id already linked to another account
      if (profile.telegram_id && profile.telegram_id !== chat_id) {
        return new Response(JSON.stringify({ success: false, message: "Already linked to another Telegram" }), { 
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      if (profile.telegram_id === chat_id) {
        return new Response(JSON.stringify({ success: true, message: "Already linked" }), { 
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      // Link telegram_id
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ telegram_id: chat_id })
        .eq("id", profile_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Link failed" }), { 
          status: 500, headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Linked successfully",
        profile_id,
      }), { headers: { "Content-Type": "application/json" } });

    } else if (action === "check_telegram") {
      // Check if telegram_id is already taken
      if (!chat_id) {
        return new Response(JSON.stringify({ error: "chat_id required" }), { 
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_id", chat_id)
        .limit(1);

      return new Response(JSON.stringify({
        taken: data && data.length > 0,
        profile_id: data?.[0]?.id || null,
      }), { headers: { "Content-Type": "application/json" } });

    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), { 
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), { 
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
});
