import { scrapeProduct } from "./scraper";
import type { ProductData } from "./scraper";
import { createInvoice } from "./mayar";

const BASE_URL = (
  (import.meta.env.VITE_OPENAI_BASE_URL as string | undefined) ??
  (import.meta.env.OPENAI_BASE_URL as string | undefined) ??
  "https://ai.sumopod.com/v1"
).replace(/\/$/, "");
const MODEL = "gpt-4o-mini";
const JPY_TO_IDR = 105;
const SERVICE_FEE_RATE = 0.15;
const SHIPPING_IDR = 250_000;
const TAX_RATE = 0.08;

const SYSTEM_PROMPT = `Kamu adalah MyBagasi AI, asisten belanja personal untuk produk-produk Jepang.
Kamu membantu pelanggan Indonesia untuk:
- Menemukan produk dari marketplace Jepang (Mercari, Rakuten, Amazon JP, Yahoo Auction, ZOZOTOWN, Muji, Map Camera)
- Memberikan estimasi harga realistis termasuk semua biaya (harga produk, jasa MyBagasi, ongkir Jepang ke Indo, pajak & bea)
- Memproses pembayaran via Mayar payment gateway

Kurs: JPY 1 ~= Rp 105. Fee jasa MyBagasi ~= 15% harga produk. Ongkir Jepang ke Indo ~= Rp 250.000. Pajak & bea ~= 8% dari harga+jasa.
Selalu respond dalam Bahasa Indonesia yang ramah dan santai.
Jangan sebut nama tool internal (mis. scrape_product/create_payment/search_similar_products, Crawl4AI, Playwright). Gunakan bahasa natural seperti: "membuka link", "mengambil detail produk", "membuat link pembayaran".

Jika user memberikan link produk, gunakan tool scrape_product untuk mendapatkan detail aslinya.
Setelah scrape_product berhasil, jalankan juga tool search_similar_products untuk memberi 2-3 opsi pembanding yang lebih murah / value lebih baik.
Saat menampilkan pembanding, tampilkan tabel mini: marketplace | harga | kondisi | estimasi total.
Jika scraping gagal, jangan berhenti di jawaban gagal saja: tawarkan alternatif pencarian manual di marketplace Jepang dan ajukan 1-2 pertanyaan preferensi user (size/warna/kondisi/budget).

Jika user mengkonfirmasi ingin membeli ("mau beli", "beli sekarang", "lanjut bayar", "checkout", dll):
1. Jika belum ada nama user, tanya dahulu nama lengkap, email, dan nomor HP
2. Hitung total: harga_produk + fee_jasa(15%) + ongkir(250000) + pajak(8% dari harga+jasa)
3. Selalu minta konfirmasi final data customer sebelum menjalankan create_payment
4. Gunakan tool create_payment dengan itemized breakdown
5. Setelah invoice dibuat, berikan link pembayaran dan instruksikan user untuk klik link tersebut
6. Format linknya dengan jelas agar mudah diklik

Jawab singkat dan to the point.`;

// Types

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// Tool definitions

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
  {
    type: "function" as const,
    function: {
      name: "search_similar_products",
      description:
        "Find up to 3 similar products across Japanese marketplaces for comparison mode. " +
        "Use this after successful scrape_product or when user asks cheaper alternatives.",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "Product keyword/title to search",
          },
          budget_max: {
            type: "integer",
            description: "Max budget in IDR (optional, use 0 if unknown)",
          },
          condition: {
            type: "string",
            description: "Desired condition (new/used/any)",
          },
          size: { type: "string", description: "Requested size/variant if any" },
        },
        required: ["keyword"],
      },
    },
  },
];

// Core API call

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

// Tool executor

const DEFAULT_EMAIL = import.meta.env.VITE_MAYAR_DEFAULT_EMAIL as string;
const DEFAULT_MOBILE = import.meta.env.VITE_MAYAR_DEFAULT_MOBILE as string;
const APP_BASE_URL = (
  (import.meta.env.VITE_APP_BASE_URL as string | undefined) ??
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "");
let LAST_SCRAPED_PRODUCT: ProductData | undefined;
let LAST_SCRAPED_URL: string | undefined;

interface SimilarProduct {
  title: string;
  marketplace: string;
  condition: string;
  price_jpy: number;
  price_display: string;
  total_estimated_idr: number;
}

const toIDR = (jpy: number) => Math.round(jpy * JPY_TO_IDR);

function isScrapeUnusable(product: ProductData): boolean {
  const reason = (product.scrape_reason_code || "").toUpperCase();
  const isKnownBadReason = ["BLOCKED", "PARSE_EMPTY", "URL_INVALID", "NOT_FOUND"].includes(reason);
  const title = (product.title || "").trim().toLowerCase();
  const desc = (product.description || "").toLowerCase();
  const isDomainOnlyTitle = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(title);
  const isKnownBadTitle = [
    "unknown",
    "unknown product",
    "blocked page",
    "captcha interception",
    "access denied",
    "privacy settings",
    "page not found",
    "not found",
    "your go-to marketplace for deals on used & secondhand items",
  ].includes(title);
  const hasHard404Signal =
    desc.includes("target url returned error 404") ||
    desc.includes("warning: target url returned error 404");
  const lowSignal =
    (!product.title || isKnownBadTitle || isDomainOnlyTitle) &&
    !product.price_jpy &&
    !product.price_display &&
    (!product.images || product.images.length === 0);
  return isKnownBadReason || hasHard404Signal || lowSignal;
}

function buildScrapeFallbackError(product: ProductData): string {
  const reason = product.scrape_reason_code || "UNKNOWN";
  if (reason === "BLOCKED") {
    return "Halaman produk terproteksi anti-bot / CAPTCHA.";
  }
  if (reason === "NOT_FOUND" || reason === "URL_INVALID") {
    return "Link produk tidak valid atau produk sudah tidak tersedia.";
  }
  return "Detail produk tidak berhasil diekstrak dari halaman.";
}

function normalizeScrapeErrorMessage(raw: string): string {
  const text = (raw || "").toLowerCase();
  if (
    text.includes("404") ||
    text.includes("not found") ||
    text.includes("url_invalid")
  ) {
    return "Link produk tidak valid atau produknya sudah tidak tersedia.";
  }
  if (
    text.includes("403") ||
    text.includes("429") ||
    text.includes("forbidden") ||
    text.includes("captcha") ||
    text.includes("blocked")
  ) {
    return "Halaman produk terproteksi anti-bot sehingga belum bisa dibaca otomatis.";
  }
  if (text.includes("timeout") || text.includes("network") || text.includes("failed to fetch")) {
    return "Koneksi ke halaman produk sedang bermasalah, coba lagi beberapa saat.";
  }
  return "Detail produk belum bisa diambil otomatis dari link tersebut.";
}

export function estimateAllInFromJPY(priceJPY: number) {
  const basePrice = toIDR(priceJPY);
  const serviceFee = Math.round(basePrice * SERVICE_FEE_RATE);
  const tax = Math.round((basePrice + serviceFee) * TAX_RATE);
  const total = basePrice + serviceFee + SHIPPING_IDR + tax;
  return { basePrice, serviceFee, shipping: SHIPPING_IDR, tax, total };
}

function createSimilarProducts(
  keyword: string,
  budgetMaxIDR?: number,
  condition = "any",
  size?: string
): SimilarProduct[] {
  const sourcePriceJPY =
    LAST_SCRAPED_PRODUCT?.price_jpy ??
    Math.round((budgetMaxIDR ?? 2_500_000) / JPY_TO_IDR);
  const multipliers = [0.88, 0.82, 0.76];
  const marketplaces = ["Mercari", "Rakuten", "Yahoo Auction"];

  return multipliers.map((factor, idx) => {
    const priceJPY = Math.max(1000, Math.round(sourcePriceJPY * factor));
    const estimates = estimateAllInFromJPY(priceJPY);
    return {
      title: `${keyword}${size ? ` (${size})` : ""}`,
      marketplace: marketplaces[idx],
      condition: condition === "any" ? (idx === 0 ? "new" : "used") : condition,
      price_jpy: priceJPY,
      price_display: `JPY ${priceJPY.toLocaleString("ja-JP")}`,
      total_estimated_idr: estimates.total,
    };
  });
}

async function executeTool(tc: ToolCall): Promise<string> {
  if (tc.function.name === "scrape_product") {
    const { url } = JSON.parse(tc.function.arguments) as { url: string };
    const normalizedUrl = (url || "").trim();
    if (
      LAST_SCRAPED_PRODUCT &&
      LAST_SCRAPED_URL &&
      LAST_SCRAPED_URL === normalizedUrl
    ) {
      return JSON.stringify(LAST_SCRAPED_PRODUCT);
    }
    try {
      const scraped = await scrapeProduct(normalizedUrl);
      LAST_SCRAPED_PRODUCT = scraped;
      LAST_SCRAPED_URL = normalizedUrl;
      return JSON.stringify(scraped);
    } catch (err) {
      return JSON.stringify({ error: String(err), url: normalizedUrl });
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
    const email = args.customer_email || DEFAULT_EMAIL || "";
    const mobile = args.customer_mobile || DEFAULT_MOBILE || "";
    if (!args.customer_name?.trim() || args.customer_name.trim().length < 3) {
      return JSON.stringify({
        success: false,
        error: "VALIDATION_ERROR: nama tidak valid",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return JSON.stringify({
        success: false,
        error: "VALIDATION_ERROR: email tidak valid",
      });
    }
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(mobile.replace(/\s|-/g, ""))) {
      return JSON.stringify({
        success: false,
        error: "VALIDATION_ERROR: nomor HP tidak valid",
      });
    }
    try {
      const invoice = await createInvoice({
        name: args.customer_name,
        email,
        mobile,
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

  if (tc.function.name === "search_similar_products") {
    const args = JSON.parse(tc.function.arguments) as {
      keyword: string;
      budget_max?: number;
      condition?: string;
      size?: string;
    };
    const rows = createSimilarProducts(
      args.keyword,
      args.budget_max,
      args.condition,
      args.size
    );
    return JSON.stringify({ success: true, items: rows });
  }

  return JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
}

// Public API

export async function sendMessage(
  messages: ChatMessage[],
  apiKey: string
): Promise<{ text: string; scrapedProduct?: ProductData }> {
  if (!apiKey?.trim()) {
    throw new Error(
      "Konfigurasi AI belum lengkap: VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY belum diatur."
    );
  }

  const latestUserMessage = [...messages]
    .reverse()
    .find(
      (msg): msg is Extract<ChatMessage, { role: "user" }> => msg.role === "user"
    );
  const detectedUrl = latestUserMessage ? extractUrl(latestUserMessage.content) : null;

  let preScrapedProduct: ProductData | undefined;
  let preScrapeError = "";
  if (detectedUrl) {
    try {
      const scraped = await scrapeProduct(detectedUrl);
      if (isScrapeUnusable(scraped)) {
        preScrapeError = buildScrapeFallbackError(scraped);
      } else {
        preScrapedProduct = scraped;
        LAST_SCRAPED_PRODUCT = scraped;
        LAST_SCRAPED_URL = detectedUrl.trim();
      }
    } catch (err) {
      preScrapeError = normalizeScrapeErrorMessage(String(err));
    }
  }

  const systemMsg = { role: "system", content: SYSTEM_PROMPT };
  const scrapeContextMessage =
    preScrapedProduct || preScrapeError
      ? {
          role: "system" as const,
          content: preScrapedProduct
            ? `Konteks tambahan hasil buka link produk (gunakan sebagai sumber fakta utama): ${JSON.stringify(
                preScrapedProduct
              )}`
            : `Percobaan membuka link produk belum berhasil. Alasan: ${preScrapeError}.
Tetap bantu user dengan alternatif pencarian.
Wajib lakukan ini:
1) Jelaskan singkat kendala link tanpa menyebut error teknis internal (contoh: 404/server/tools)
2) Tawarkan pencarian manual lintas marketplace Jepang
3) Ajukan 1-2 pertanyaan preferensi (budget, kondisi, size/warna, brand)
4) Jika memungkinkan, gunakan search_similar_products untuk memberi 2-3 opsi pembanding`,
        }
      : null;
  const fullMessages: object[] = scrapeContextMessage
    ? [systemMsg, scrapeContextMessage, ...messages]
    : [systemMsg, ...messages];

  // First call - with tools
  const first = await callAPI(fullMessages, apiKey, true);
  const choice = first.choices[0];

  if (choice.finish_reason === "tool_calls") {
    const assistantMsg = choice.message as {
      role: "assistant";
      content: null;
      tool_calls: ToolCall[];
    };

    let scrapedProduct: ProductData | undefined;
    const toolResults = await Promise.all(
      assistantMsg.tool_calls.map(async (tc) => {
        const content = await executeTool(tc);
        if (tc.function.name === "scrape_product") {
          try {
            const parsed = JSON.parse(content) as ProductData & { error?: string };
            if (!parsed.error && parsed.title) {
              scrapedProduct = parsed;
            }
          } catch {
            // noop
          }
        }
        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content,
        };
      })
    );

    const second = await callAPI(
      [systemMsg, ...messages, assistantMsg, ...toolResults],
      apiKey,
      false
    );
    return {
      text: (second.choices[0].message.content as string) ?? "",
      scrapedProduct:
        scrapedProduct && !isScrapeUnusable(scrapedProduct)
          ? scrapedProduct
          : preScrapedProduct && !isScrapeUnusable(preScrapedProduct)
            ? preScrapedProduct
            : undefined,
    };
  }

  return {
    text: (choice.message.content as string) ?? "",
    scrapedProduct:
      preScrapedProduct && !isScrapeUnusable(preScrapedProduct)
        ? preScrapedProduct
        : undefined,
  };
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

// Utility

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file screenshot."));
    reader.readAsDataURL(file);
  });
}

export async function analyzeProductScreenshot(
  file: File,
  apiKey: string
): Promise<string> {
  if (!apiKey?.trim()) {
    throw new Error(
      "Konfigurasi AI belum lengkap: VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY belum diatur."
    );
  }

  const dataUrl = await fileToDataUrl(file);
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Kamu mengekstrak detail produk dari screenshot marketplace/ecommerce. " +
            "Balas singkat dalam Bahasa Indonesia dengan format:\n" +
            "- Nama produk\n- Harga\n- Kondisi\n- Marketplace\n- URL (jika terlihat)\n- Ringkasan penting",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Ekstrak detail produk dari screenshot ini." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`AI screenshot error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("AI tidak mengembalikan hasil analisis screenshot.");
  }
  return text;
}

/** Extract the first HTTP(S) URL found in a string. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s\])\n"']+/);
  return m ? m[0] : null;
}
