import { scrapeProduct } from "./scraper";
import type { ProductData } from "./scraper";
import { searchProducts } from "./scraper";
import { createInvoice } from "./mayar";
import { appConfig } from "@/lib/runtime-config";

const BASE_URL = appConfig.openAiBaseUrl;
const MODEL = appConfig.openAiModel;
const JPY_TO_IDR = appConfig.pricing.jpyToIdr;
const SERVICE_FEE_RATE = appConfig.pricing.serviceFeeRate;
const SHIPPING_IDR = appConfig.pricing.shippingIdr;
const TAX_RATE = appConfig.pricing.taxRate;

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
Jika user meminta cari produk dari kata kunci saja (tanpa link), WAJIB gunakan tool search_similar_products dulu untuk browsing marketplace dan mengambil kandidat nyata.

PENTING - JANGAN PERNAH membuat data produk palsu atau menebak harga:
- Jika search_similar_products mengembalikan items kosong, JANGAN buat produk tiruan.
- Katakan jujur bahwa pencarian belum menemukan hasil, lalu tawarkan alternatif manual.
- Sarankan user untuk share link produk langsung dari marketplace agar bisa dibaca dengan akurat.
- Berikan link langsung ke marketplace: jp.mercari.com/search, search.rakuten.co.jp, auctions.yahoo.co.jp

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
        "Browse and scrape up to 6 real product candidates across ecommerce/marketplace websites using keyword search. " +
        "Use this after successful scrape_product, when user asks cheaper alternatives, or when user asks to find product without sharing link.",
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

const DEFAULT_EMAIL = appConfig.defaultMayarEmail;
const DEFAULT_MOBILE = appConfig.defaultMayarMobile;
const APP_BASE_URL = appConfig.appBaseUrl;
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

function normalizeUrlCandidate(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  const withoutTrailingPunctuation = trimmed.replace(/[),.;!?]+$/, "");
  const hasScheme = /^https?:\/\//i.test(withoutTrailingPunctuation);
  if (hasScheme) return withoutTrailingPunctuation;

  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(withoutTrailingPunctuation)) {
    return `https://${withoutTrailingPunctuation}`;
  }
  return null;
}

export function estimateAllInFromJPY(priceJPY: number) {
  const basePrice = toIDR(priceJPY);
  const serviceFee = Math.round(basePrice * SERVICE_FEE_RATE);
  const tax = Math.round((basePrice + serviceFee) * TAX_RATE);
  const total = basePrice + serviceFee + SHIPPING_IDR + tax;
  return { basePrice, serviceFee, shipping: SHIPPING_IDR, tax, total };
}

// REMOVED: createSimilarProducts() — was generating fake/template product data.
// Better to return empty results than fabricated products.

function mapSearchResultsToSimilar(
  products: ProductData[],
  fallbackKeyword: string,
  requestedCondition = "any"
): SimilarProduct[] {
  const mapped = products
    .map((p) => {
      let jpy = p.price_jpy ?? 0;
      if (!jpy && p.price_display) {
        const n = Number(
          (p.price_display.match(/\d[\d,.]*/) || ["0"])[0].replace(/[,.]/g, "")
        );
        if (Number.isFinite(n) && n > 0) jpy = n;
      }
      if (!jpy || jpy < 100) return null;
      return {
        title: p.title || fallbackKeyword,
        marketplace: p.marketplace || "marketplace",
        condition:
          p.condition ||
          (requestedCondition === "any" ? "unknown" : requestedCondition),
        price_jpy: jpy,
        price_display: p.price_display || `JPY ${jpy.toLocaleString("ja-JP")}`,
        total_estimated_idr: estimateAllInFromJPY(jpy).total,
      } as SimilarProduct;
    })
    .filter((x): x is SimilarProduct => Boolean(x));

  return mapped.slice(0, 6);
}

async function executeTool(tc: ToolCall): Promise<string> {
  if (tc.function.name === "scrape_product") {
    const { url } = JSON.parse(tc.function.arguments) as { url: string };
    const normalizedUrl = normalizeUrlCandidate(url);
    if (!normalizedUrl) {
      return JSON.stringify({ error: "URL_INVALID", url: url ?? "" });
    }
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
    try {
      const searched = await searchProducts({
        keyword: args.keyword,
        condition: args.condition,
        size: args.size,
        limit: 6,
      });
      const rows = mapSearchResultsToSimilar(
        searched,
        args.keyword,
        args.condition
      );
      if (rows.length > 0) {
        return JSON.stringify({ success: true, items: rows, source: "live_search" });
      }
    } catch {
      // Search failed — do NOT generate fake products
    }

    // Return honest "no results" instead of fabricated template data
    return JSON.stringify({
      success: false,
      items: [],
      source: "none",
      message:
        "Pencarian di marketplace Jepang belum menghasilkan produk yang cocok. " +
        "Coba kata kunci yang lebih spesifik, atau share langsung link produk yang diinginkan.",
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
}

// Public API

export async function sendMessage(
  messages: ChatMessage[],
  apiKey: string
): Promise<{ text: string; scrapedProduct?: ProductData }> {
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

  if (!apiKey?.trim()) {
    if (preScrapedProduct) {
      return {
        text:
          "Detail produk berhasil dibaca dari link. Untuk respons AI yang lebih lengkap (rekomendasi + perbandingan otomatis), " +
          "isi VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY di frontend.",
        scrapedProduct: preScrapedProduct,
      };
    }

    if (detectedUrl) {
      return {
        text:
          `Link sudah diterima, tapi detail belum bisa diekstrak otomatis. ${preScrapeError || "Coba kirim ulang link produk yang berbeda."} ` +
          "Jika ingin fitur chat AI penuh, isi VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY di frontend.",
      };
    }

    throw new Error(
      "Konfigurasi AI belum lengkap: VITE_SUMOPOD_API_KEY atau VITE_OPENAI_API_KEY belum diatur."
    );
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

/** Extract the first URL (with/without scheme) found in a string and normalize it. */
export function extractUrl(text: string): string | null {
  const withScheme = text.match(/https?:\/\/[^\s\])\n"']+/i)?.[0];
  if (withScheme) return normalizeUrlCandidate(withScheme);

  const withoutScheme = text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s\])\n"']*)?/i)?.[0];
  if (withoutScheme) return normalizeUrlCandidate(withoutScheme);

  return null;
}
