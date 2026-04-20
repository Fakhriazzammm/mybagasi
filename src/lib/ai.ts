import { scrapeProduct } from "./scraper";

const BASE_URL = "https://ai.sumopod.com/v1";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Kamu adalah MyBagasi AI, asisten belanja personal untuk produk-produk Jepang.
Kamu membantu pelanggan Indonesia untuk:
- Menemukan produk dari marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction, ZOZOTOWN, Muji, Map Camera)
- Memberikan estimasi harga realistis termasuk semua biaya (harga produk, jasa MyBagasi, ongkir Jepang→Indo, pajak & bea)
- Membantu proses pembelian, pembayaran, dan tracking pengiriman

Selalu respond dalam Bahasa Indonesia yang ramah dan santai.
Kurs: ¥1 ≈ Rp 105. Fee jasa MyBagasi ≈ 15% harga produk. Ongkir Jepang→Indo ≈ Rp 200.000–500.000.
Jika user memberikan link produk, gunakan tool scrape_product untuk mendapatkan detail aslinya.
Setelah scraping, berikan estimasi biaya all-in yang realistis dalam Rupiah.
Jawab singkat dan to the point.`;

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "scrape_product",
      description:
        "Scrape product details (title, price, images, condition, description) from a Japanese marketplace URL. " +
        "Supported: Mercari, Amazon JP, Rakuten, Yahoo Auction, and other Japanese sites. " +
        "Always call this when the user provides a product URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full product URL to scrape" },
        },
        required: ["url"],
      },
    },
  },
];

// ─── Core API call ───────────────────────────────────────────────────────────

async function callAPI(
  messages: object[],
  apiKey: string,
  withTools: boolean
): Promise<{ choices: Array<{ finish_reason: string; message: Record<string, unknown> }> }> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: 600,
    temperature: 0.7,
  };
  if (withTools) {
    body.tools = TOOLS;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`AI API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── Tool executor ───────────────────────────────────────────────────────────

async function executeTool(tc: ToolCall): Promise<string> {
  if (tc.function.name === "scrape_product") {
    const { url } = JSON.parse(tc.function.arguments) as { url: string };
    try {
      const data = await scrapeProduct(url);
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ error: String(err), url });
    }
  }
  return JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendMessage(
  messages: ChatMessage[],
  apiKey: string
): Promise<string> {
  const systemMsg = { role: "system", content: SYSTEM_PROMPT };
  const fullMessages: object[] = [systemMsg, ...messages];

  // First call — with tools enabled
  const first = await callAPI(fullMessages, apiKey, true);
  const choice = first.choices[0];

  if (choice.finish_reason === "tool_calls") {
    const assistantMsg = choice.message as {
      role: "assistant";
      content: null;
      tool_calls: ToolCall[];
    };

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      assistantMsg.tool_calls.map(async (tc) => ({
        role: "tool" as const,
        tool_call_id: tc.id,
        content: await executeTool(tc),
      }))
    );

    // Second call — with tool results, no tools needed
    const continuedMessages: object[] = [
      systemMsg,
      ...messages,
      assistantMsg,
      ...toolResults,
    ];
    const second = await callAPI(continuedMessages, apiKey, false);
    return (second.choices[0].message.content as string) ?? "";
  }

  return (choice.message.content as string) ?? "";
}

export async function* streamMessage(
  messages: ChatMessage[],
  apiKey: string
): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 600,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`AI API error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const token = (JSON.parse(payload) as { choices: Array<{ delta: { content?: string } }> })
          .choices[0]?.delta?.content;
        if (token) yield token;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}
