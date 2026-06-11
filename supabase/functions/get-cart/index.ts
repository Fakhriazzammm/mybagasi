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
    const user_id = url.searchParams.get("user_id");

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id query param required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: items, error } = await supabase
      .from("cart_items")
      .select("id, product_name, price_jpy, url, image_url, quantity, source, notes, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const total_jpy = (items || []).reduce((sum, item) => sum + (item.price_jpy * item.quantity), 0);

    return new Response(JSON.stringify({
      success: true,
      items: items || [],
      total_items: (items || []).length,
      total_jpy,
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
