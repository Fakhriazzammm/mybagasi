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
    const { user_id, product_name, price_jpy, url, image_url, quantity, source, notes } = await req.json();

    if (!user_id || !product_name || !price_jpy) {
      return new Response(JSON.stringify({ error: "user_id, product_name, price_jpy required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if same product (by name + url) already exists in cart
    let query = supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user_id)
      .eq("product_name", product_name);

    if (url) {
      query = query.eq("url", url);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      // Increment quantity
      const newQty = existing.quantity + (quantity || 1);
      const { error: updateError } = await supabase
        .from("cart_items")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateError) throw updateError;

      // Get total items count
      const { count } = await supabase
        .from("cart_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id);

      return new Response(JSON.stringify({
        success: true,
        item_id: existing.id,
        total_items: count || 0,
        message: `✓ ${product_name} ditambahkan ke cart! (${count || 0} item di cart)`,
        updated: true,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Insert new item
    const { data, error } = await supabase
      .from("cart_items")
      .insert({
        user_id,
        product_name,
        price_jpy,
        url: url || null,
        image_url: image_url || null,
        quantity: quantity || 1,
        source: source || "telegram_bot",
        notes: notes || null,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Get total items count
    const { count } = await supabase
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id);

    return new Response(JSON.stringify({
      success: true,
      item_id: data.id,
      total_items: count || 0,
      message: `✓ ${product_name} ditambahkan ke cart! (${count || 0} item di cart)`,
      updated: false,
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
