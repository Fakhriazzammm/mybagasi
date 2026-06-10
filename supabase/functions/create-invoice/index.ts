import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const botSecret = Deno.env.get("BOT_SECRET");
  if (req.headers.get("x-bot-secret") !== botSecret) {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    const { name, amount, email }:{name:string;amount:number;email?:string} = await req.json();
    
    if (!name || !amount) {
      return new Response(JSON.stringify({ error: "name and amount required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    
    const mayarRes = await fetch("https://api.mayar.id/hl/v1/invoice/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("MAYAR_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        amount,
        customer: email ? { email } : undefined,
      }),
    });

    const mayarData = await mayarRes.json();
    
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
