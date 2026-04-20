import { scrapeProduct } from "./scraper";
import { createInvoice } from "./mayar";

const BASE_URL = "https://ai.sumopod.com/v1";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Kamu adalah MyBagasi AI, asisten belanja personal untuk produk-produk Jepang.
Kamu membantu pelanggan Indonesia untuk:
- Menemukan produk dari marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction, ZOZOTOWN, Muji, Map Camera)
- Memberikan estimasi harga realistis termasuk semua biaya (harga produk, jasa MyBagasi, ongkir Jepang→Indo, pajak & bea)
- Memproses pembayaran via Mayar payment gateway

Kurs: ¥1 ≈ Rp 105. Fee jasa MyBagasi ≈ 15% harga produk. Ongkir Jepang→Indo ≈ Rp 250.000. Pajak & bea ≈ 8% dari harga+jasa.
Selalu respond dalam Bahasa Indonesia yang ramah dan santai.

Jika user memberikan link produk → gunakan tool scrape_product untuk mendapatkan detail aslinya.

Jika user mengkonfirmasi ingin membeli ("mau beli", "beli sekarang", "lanjut bayar", "checkout", dll):
1. Jika belum ada nama user, tanya dahulu nama lengkap, email, dan nomor HP
2. Hitung total: harga_produk + fee_jasa(15%) + ongkir(250000) + pajak(8% dari harga+jasa)
3. Gunakan tool create_payment dengan itemized breakdown
4. Setelah invoice dibuat, berikan link pembayaran dan instruksikan user untuk klik link tersebut
5. Format linknya dengan jelas agar mudah diklik

Jawab singkat dan to the point.`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

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
  {
    type: "function" as const,
    function: {
      name: "create_payment",
      description:
        "Create a Mayar payment invoice for a product purchase. Call this when the user confirms they want to buy. " +
        "Returns a payment URL the user must visit to complete the transaction.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "Customer full name",
          },
          customer_email: {
            type: "string",
            description:
              "Customer email address (use default if not provided by user)",
          },
          customer_mobile: {
            type: "string",
            description:
              "Customer mobile number in Indonesian format (use default if not provided)",
          },
          order_description: {
            type: "string",
            description: "Full order description",
          },
          items: {
            type: "array",
            description: "Itemized cost breakdown",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "integer" },
                rate: {
                  type: "integer",
                  description: "Price per item in IDR (Rupiah)",
                },
              },
              required: ["description", "quantity", "rate"],
            },
          },
        },
        required: [
          "customer_name",
          "customer_email",
          "customer_mobile",
          "order_description",
          "items",
        ],
      },
    },
  },
];

// ─── Core API call ────────────────────────────────────────────────────────────

async function callAPI(
  messages: object[],
  apiKey: string,
  withTools: boolean
): Promise<{
  choices: Array<{
    finish_reason: string;
    message: Record<string, unknown>;
  }>;
}> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: 700,
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

// ─── Tool executor ─────────────────────────────────────────────────────────────

const DEFAULT_EMAIL = import.meta.env.VITE_MAYAR_DEFAULT_EMAIL as string;
const DEFAULT_MOBILE = import.meta.env.VITE_MAYAR_DEFAULT_MOBILE as string;
const APP_BASE_URL = import.meta.env.VITE_APP_BASE_URL as string;

async function executeTool(tc: ToolCall): Promise<string> {
  if (tc.function.name === "scrape_product") {
    const { url } = JSON.parse(tc.function.arguments) as { url: string };
    try {
      return JSON.stringify(await scrapeProduct(url));
    } catch (err) {
      return JSON.stringify({ error: String(err), url });
    }
  }

  if (tc.function.name === "create_payment") {
    const args = JSON.parse(tc.function.arguments) as {
      customer_name: string;
      customer_email?: string;
      customer_mobile?: string;
      order_description: string;
      items: Array<{ description: string; quantity: number; rate: number }>;
    };
    try {
      const invoice = await createInvoice({
        name: args.customer_name,
        email: args.customer_email || DEFAULT_EMAIL,
        mobile: args.customer_mobile || DEFAULT_MOBILE,
        description: args.order_description,
        redirectUrl: `${APP_BASE_URL}/payment/status`,
        items: args.items,
      });
      return JSON.stringify({
        success: true,
        invoice_id: invoice.id,
        payment_url: invoice.link,
      });
    } catch (err) {
      return JSON.stringify({ success: false, error: String(err) });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendMessage(
  messages: ChatMessage[],
  apiKey: string
): Promise<string> {
  const systemMsg = { role: "system", content: SYSTEM_PROMPT };
  const fullMessages: object[] = [systemMsg, ...messages];

  // First call — with tools
  const first = await callAPI(fullMessages, apiKey, true);
  const choice = first.choices[0];

  if (choice.finish_reason === "tool_calls") {
    const assistantMsg = choice.message as {
      role: "assistant";
      content: null;
      tool_calls: ToolCall[];
    };

    const toolResults = await Promise.all(
      assistantMsg.tool_calls.map(async (tc) => ({
        role: "tool" as const,
        tool_call_id: tc.id,
        content: await executeTool(tc),
      }))
    );

    const second = await callAPI(
      [systemMsg, ...messages, assistantMsg, ...toolResults],
      apiKey,
      false
    );
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
      max_tokens: 700,
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
        const token = (
          JSON.parse(payload) as {
            choices: Array<{ delta: { content?: string } }>;
          }
        ).choices[0]?.delta?.content;
        if (token) yield token;
      } catch {
        // skip malformed chunk
      }
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Extract the first HTTP(S) URL found in a string. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s\])\n"']+/);
  return m ? m[0] : null;
}
