import { searchProducts } from "./scraper";
import type { ProductData } from "./scraper";
import { scrapeProductWithFallback } from "./scrape-jobs";
import { createInvoice } from "./mayar";
import { appConfig } from "@/lib/runtime-config";

const BASE_URL = appConfig.openAiBaseUrl;
const MODEL = appConfig.openAiModel;
const JPY_TO_IDR = appConfig.pricing.jpyToIdr;

// Shipping rates by category (mirip bot Telegram)
const SHIPPING_RATES: Record<string, number> = {
  fashion: 125_000,
  elektronik: 150_000,
  skincare: 105_000,
  buku: 60_000,
  food: 150_000,
  general: 125_000,
};

const SYSTEM_PROMPT = `Kamu adalah MyBagasi AI, asisten personal shopper untuk produk-produk dari Jepang.

TUGAS KAMU:
- Membantu pelanggan Indonesia membeli produk dari Jepang
- Cari **harga resmi/retail** dari **Amazon JP, Rakuten, toko official** (baru, original)
- ⛔ JANGAN GUNAKAN Mercari, Yahoo Auction, Yahoo Shopping, atau PayPay Flea Market
- Jika hasil pencarian hanya dari second/marketplace non-resmi, KATAKAN "Tidak ditemukan produk baru dari toko resmi"
- Memberikan estimasi harga all-in (harga produk + fee jasa + ongkir + pajak)
- Memproses pembayaran via Mayar

KONVERSI & ESTIMASI:
- Kurs: 1 JPY = Rp 105 (nilai aktual bisa berbeda, tapi untuk estimasi pakai ~105)
- Fee jasa: otomatis dihitung sistem (~6-10% dari harga produk tergantung tier)
- Ongkir: DINAMIS tergantung kategori produk (lihat tabel di bawah)
- Pajak & bea cukai: 11% dari (harga produk + fee jasa)
- TIDAK ADA komponen "Profit" terpisah — fee jasa sudah termasuk profit

TABEL ONGKIR PER KATEGORI:
- fashion (pakaian, sepatu): ~Rp125.000
- elektronik (elektronik kecil): ~Rp150.000
- skincare (kosmetik/cairan): ~Rp105.000
- buku (buku/majalah): ~Rp60.000
- food (makanan/minuman): ~Rp150.000
- general (lainnya): ~Rp125.000

FORMAT WAJIB untuk produk hasil scrape/cari:

### Produk Ditemukan:
- **Judul:** <judul>
- **Harga:** JPY X
- **Marketplace:** Amazon JP / Rakuten
- **Link:** [Lihat Produk](url)

Estimasi Biaya (kategori: ...):
- **Harga Produk:** Rp ...
- **Fee Jasa:** Rp ...
- **Ongkir:** Rp ... (kategori)
- **Pajak (11%):** Rp ...
- **Total All-in:** Rp ...

### Opsi Pembanding (jika ada):

| Produk | Harga | Marketplace | Estimasi Total | Link |
|--------|-------|-------------|----------------|------|
| <max 40 char> | JPY X | Amazon/Rakuten | Rp ... | [Buka](url) |

Aturan:
- Gunakan search_similar_products untuk cari pembanding
- Maksimum 5 baris tabel
- Jangan ulangi produk asli
- JANGAN PERNAH buat data palsu — jika search kosong, katakan jujur

Jika user ingin cari produk tanpa link, WAJIB gunakan search_similar_products dulu.

PENTING — JANGAN PERNAH membuat data produk palsu atau menebak harga:
- Jika search_similar_products kosong, JANGAN buat produk tiruan
- Katakan jujur dan tawarkan share link langsung
- Berikan link: search.rakuten.co.jp, amazon.co.jp

Jika scraping gagal, tawarkan alternatif dan ajukan preferensi user.

Jika user mengkonfirmasi ingin membeli ("mau beli", "beli sekarang", "lanjut bayar", "checkout", dll):
1. Tanya nama lengkap, email, dan nomor HP (jika belum ada)
2. Hitung total dengan ongkir sesuai kategori produk
3. Minta konfirmasi final data customer sebelum create_payment
4. Gunakan tool create_payment dengan itemized breakdown
5. Berikan link pembayaran dan instruksi klik

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
        "Scrape product details (title, price, images, description) from a Japanese marketplace URL. " +
        "Supported: Amazon JP, Rakuten, and Japanese official store. " +
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
        "Cari produk BARU dari Amazon JP, Rakuten, atau toko official Jepang berdasarkan kata kunci. " +
        "Gunakan setelah scrape_product berhasil, saat user minta alternatif lebih murah, atau saat user cari produk tanpa link. " +
        "⛔ JANGAN gunakan Mercari, Yahoo Auction, atau second market.",
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
  url: string;
}

const toIDR = (jpy: number) => Math.round(jpy * JPY_TO_IDR);

export function isScrapeUnusable(product: ProductData): boolean {
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

export function estimateAllInFromJPY(priceJPY: number, category = "general") {
  const basePrice = toIDR(priceJPY);
  // Fee: estimasi tier based (mirip bot)
  const feeEstimate = basePrice < 1000000 ? 100000 :
    basePrice < 3000000 ? 300000 :
    basePrice < 5000000 ? 500000 :
    basePrice < 10000000 ? 1000000 : 2000000;
  const shipping = SHIPPING_RATES[category] || SHIPPING_RATES.general;
  const tax = Math.round((basePrice + feeEstimate) * 0.11);
  const total = basePrice + feeEstimate + shipping + tax;
  return { basePrice, serviceFee: feeEstimate, shipping, tax, total, category };
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
      const marketplace = (p.marketplace || "").toLowerCase();
      const category = marketplace.includes("fashion") ? "fashion" :
        marketplace.includes("elektronik") ? "elektronik" :
        marketplace.includes("skincare") || marketplace.includes("kosmetik") ? "skincare" :
        marketplace.includes("buku") ? "buku" :
        marketplace.includes("food") || marketplace.includes("makanan") ? "food" :
        "general";
      return {
        title: p.title || fallbackKeyword,
        marketplace: p.marketplace || "marketplace",
        condition:
          p.condition ||
          (requestedCondition === "any" ? "unknown" : requestedCondition),
        price_jpy: jpy,
        price_display: p.price_display || `JPY ${jpy.toLocaleString("ja-JP")}`,
        total_estimated_idr: estimateAllInFromJPY(jpy, category).total,
        url: p.url || "",
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
      const fallback = await scrapeProductWithFallback(normalizedUrl);
      if (fallback.product) {
        LAST_SCRAPED_PRODUCT = fallback.product;
        LAST_SCRAPED_URL = normalizedUrl;
        return JSON.stringify(fallback.product);
      }
      return JSON.stringify({
        error: fallback.error || "SCRAPE_FAILED",
        url: normalizedUrl,
        source: fallback.source,
      });
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
      const fallback = await scrapeProductWithFallback(detectedUrl);
      if (fallback.product) {
        const scraped = fallback.product;
        if (isScrapeUnusable(scraped)) {
          preScrapeError = buildScrapeFallbackError(scraped);
        } else {
          preScrapedProduct = scraped;
          LAST_SCRAPED_PRODUCT = scraped;
          LAST_SCRAPED_URL = detectedUrl.trim();
        }
      } else {
        preScrapeError = normalizeScrapeErrorMessage(fallback.error || "SCRAPE_FAILED");
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

// ─── Streaming ──────────────────────────────────────────────────────────────

export type StreamChunk = {
  type: "content";
  text: string;
} | {
  type: "done";
  fullContent: string;
} | {
  type: "error";
  error: string;
};

/**
 * Call the AI API with streaming enabled.
 * Yields chunks of text as they arrive from the SSE stream.
 *
 * Usage:
 *   const reader = streamChatCompletion(messages, apiKey);
 *   for await (const chunk of reader) {
 *     if (chunk.type === "content") setText(prev => prev + chunk.text);
 *   }
 */
export async function* streamChatCompletion(
  messages: ChatMessage[],
  apiKey: string,
  options?: { systemPrompt?: string; maxTokens?: number }
): AsyncGenerator<StreamChunk> {
  const msgs: object[] = options?.systemPrompt
    ? [{ role: "system", content: options.systemPrompt }, ...messages]
    : messages;

  const body: Record<string, unknown> = {
    model: MODEL,
    messages: msgs,
    max_tokens: options?.maxTokens ?? 700,
    temperature: 0.7,
    stream: true,
  };

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
    yield { type: "error", error: `AI API error ${res.status}: ${err}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: "error", error: "Response body is not readable" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6); // Remove "data: " prefix
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            yield { type: "content", text: delta };
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: "done", fullContent };
}
