import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAYAR_API_KEY = Deno.env.get("MAYAR_API_KEY") || "";
const BOT_SECRET = Deno.env.get("BOT_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const JPY_TO_IDR = parseInt(Deno.env.get("JPY_TO_IDR") || "112");
const SERVICE_FEE_RATE = 0.10;
const SHIPPING_IDR = 250000;
const ADMIN_FEE = 25000;

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Auth check
    const headerSecret = req.headers.get("x-bot-secret") || "";
    if (headerSecret !== BOT_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { user_id, email } = body;
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch cart items
    const { data: cartItems, error: cartError } = await supabase
      .from("cart_items")
      .select("id, product_name, price_jpy, quantity, url, image_url, source")
      .eq("user_id", user_id);

    if (cartError) {
      return new Response(JSON.stringify({
        error: "Cart fetch failed",
        detail: cartError.message || String(cartError),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!cartItems || cartItems.length === 0) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate totals
    const subtotal_jpy = cartItems.reduce((sum, item) => sum + (item.price_jpy * item.quantity), 0);
    const subtotal_idr = subtotal_jpy * JPY_TO_IDR;
    const service_fee = Math.round(subtotal_idr * SERVICE_FEE_RATE);
    const total_idr = subtotal_idr + service_fee + SHIPPING_IDR + ADMIN_FEE;

    // Get customer email
    let customerEmail = email || "";
    if (!customerEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user_id)
        .single();
      customerEmail = profile?.email || "";
    }

    // Build Mayar invoice
    const productNames = cartItems.map(i => `${i.product_name} x${i.quantity}`).join(", ");
    const mayarItems = cartItems.map(i => ({
      description: i.product_name,
      quantity: i.quantity,
      rate: i.price_jpy * JPY_TO_IDR,
    }));
    const invoiceBody = {
      name: `Pesanan MyBagasi (${cartItems.length} item)`,
      description: productNames,
      items: mayarItems,
      email: customerEmail,
      mobile: "085156399831",
    };

    let mayarRes, mayarData;
    try {
      mayarRes = await fetch("https://api.mayar.id/hl/v1/invoice/create", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MAYAR_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoiceBody),
      });
      mayarData = await mayarRes.json();
    } catch (fetchErr) {
      return new Response(JSON.stringify({
        error: "Mayar API call failed",
        detail: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        stage: "fetch_mayar",
      }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!mayarRes.ok) {
      return new Response(JSON.stringify({
        error: "Mayar invoice creation failed",
        mayar_status: mayarRes.status,
        mayar_response: mayarData,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Clear cart
    await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", user_id);

    const invoiceUrl = mayarData.data?.paymentUrl || mayarData.data?.url || mayarData?.url || mayarData?.redirect_url || "";
    const invoiceId = mayarData.data?.id || mayarData?.id || "";

    return new Response(JSON.stringify({
      success: true,
      invoice_url: invoiceUrl,
      invoice_id: invoiceId,
      order_summary: {
        items: cartItems.map(item => ({
          name: item.product_name,
          price_jpy: item.price_jpy,
          price_idr: item.price_jpy * JPY_TO_IDR,
          qty: item.quantity,
          url: item.url,
        })),
        subtotal_jpy,
        subtotal_idr,
        service_fee,
        shipping: SHIPPING_IDR,
        admin_fee: ADMIN_FEE,
        total_idr,
        total_jpy: Math.round(total_idr / JPY_TO_IDR),
      },
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "Checkout failed",
      detail: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
