import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  let name: string | null = null;
  let amount: number | null = null;
  let email: string | null = null;

  if (req.method === "GET") {
    // GET mode — for web_extract tool (agent without terminal/curl)
    const url = new URL(req.url);
    name = url.searchParams.get("name");
    amount = url.searchParams.get("amount") ? Number(url.searchParams.get("amount")) : null;
    email = url.searchParams.get("email");
  } else if (req.method === "POST") {
    // POST mode — with x-bot-secret auth
    const botSecret = Deno.env.get("BOT_SECRET");
    if (botSecret && req.headers.get("x-bot-secret") !== botSecret) {
      return new Response("Unauthorized", { status: 403 });
    }
    try {
      const body = await req.json();
      name = body.name;
      amount = body.amount;
      email = body.email || null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
  } else {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!name || !amount) {
    return new Response(JSON.stringify({ error: "name and amount required" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const mayarRes = await fetch("https://api.mayar.id/hl/v1/invoice/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("MAYAR_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        amount,
        ...(email ? { customer: { email } } : {}),
      }),
    });

    const mayarData = await mayarRes.json();
    mayarData._invoice_url = mayarData.data?.url || null;

    return new Response(JSON.stringify(mayarData), {
      status: mayarRes.ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
});
