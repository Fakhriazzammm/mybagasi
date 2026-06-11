import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const botSecret = Deno.env.get("BOT_SECRET");
  if (req.headers.get("x-bot-secret") !== botSecret) {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, name, email, username, telegram_id, telegram_token, role, tier, status, points_balance, created_at")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      user_id: profile.id,
      name: profile.name,
      email: profile.email,
      username: profile.username,
      telegram_connected: !!profile.telegram_id,
      telegram_token: profile.telegram_token,
      role: profile.role,
      tier: profile.tier,
      status: profile.status,
      points: profile.points_balance,
      joined_at: profile.created_at,
      profile_url: `https://mybagasi.my.id/${profile.username}/profile`,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
