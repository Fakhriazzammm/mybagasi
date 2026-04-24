import { appConfig } from "@/lib/runtime-config";
import { scrapeProductWithFallback } from "@/lib/scrape-jobs";
import { searchProducts } from "@/lib/scraper";
import type { ProductData } from "@/lib/scraper";

export interface SmartQuotationInput {
  url?: string;
  query?: string;
  budget?: string;
}

export interface PriceHistorySummary {
  minJpy: number;
  maxJpy: number;
  avgJpy: number;
  samples: number;
}

export interface SmartQuotationResult {
  product: string;
  sourceUrl?: string;
  marketplace: string;
  productJpy: number;
  rate: number;
  fee: number;
  shipping: number;
  tax: number;
  membershipDiscount: number;
  pointsUsed: number;
  confidenceScore: number;
  confidenceLabel: "High" | "Medium" | "Low";
  confidenceReasons: string[];
  priceHistory: PriceHistorySummary;
  similarCount: number;
}

const parseBudgetIdr = (raw?: string): number | null => {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const inferMarketplace = (url?: string, fallback = "Marketplace Jepang"): string => {
  if (!url) return fallback;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("mercari")) return "Mercari";
    if (host.includes("rakuten")) return "Rakuten";
    if (host.includes("amazon")) return "Amazon JP";
    if (host.includes("yahoo")) return "Yahoo Auction";
    if (host.includes("zozo")) return "ZOZOTOWN";
    return host.replace("www.", "");
  } catch {
    return fallback;
  }
};

const normalizeKeyword = (input: SmartQuotationInput, scraped?: ProductData): string => {
  if (input.query?.trim()) return input.query.trim();
  if (scraped?.title?.trim()) return scraped.title.trim();
  if (input.url) {
    try {
      const path = new URL(input.url).pathname;
      const slug = path
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]/g, " ")
        .replace(/[0-9]+/g, " ")
        .trim();
      if (slug) return slug;
    } catch {
      // ignore
    }
  }
  return "Produk Jepang";
};

const getPriceJpy = (product: ProductData): number | null => {
  if (typeof product.price_jpy === "number" && product.price_jpy > 0) return product.price_jpy;
  const fromDisplay = product.price_display?.match(/\d[\d,.]*/)?.[0];
  if (!fromDisplay) return null;
  const parsed = Number(fromDisplay.replace(/[,.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const summarizeHistory = (prices: number[]): PriceHistorySummary => {
  if (prices.length === 0) {
    return { minJpy: 0, maxJpy: 0, avgJpy: 0, samples: 0 };
  }
  const minJpy = Math.min(...prices);
  const maxJpy = Math.max(...prices);
  const avgJpy = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length);
  return { minJpy, maxJpy, avgJpy, samples: prices.length };
};

const confidenceLabel = (score: number): "High" | "Medium" | "Low" => {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
};

export async function generateSmartQuotation(input: SmartQuotationInput): Promise<SmartQuotationResult> {
  const rate = appConfig.pricing.jpyToIdr;
  const feeRate = appConfig.pricing.serviceFeeRate;
  const shipping = appConfig.pricing.shippingIdr;
  const taxRate = appConfig.pricing.taxRate;

  let scraped: ProductData | undefined;
  if (input.url?.trim()) {
    const scrapedResult = await scrapeProductWithFallback(input.url.trim());
    if (scrapedResult.product) {
      scraped = scrapedResult.product;
    }
  }

  const keyword = normalizeKeyword(input, scraped);
  const candidates = await searchProducts({ keyword, limit: 8 }).catch(() => []);

  const budgetIdr = parseBudgetIdr(input.budget);
  const budgetJpy = budgetIdr ? Math.floor(budgetIdr / rate) : null;

  const comparablePrices = candidates
    .map(getPriceJpy)
    .filter((price): price is number => typeof price === "number" && price > 0)
    .filter((price) => (budgetJpy ? price <= budgetJpy : true));

  const scrapedPrice = scraped ? getPriceJpy(scraped) : null;

  const productJpy = scrapedPrice
    ?? comparablePrices[0]
    ?? Math.max(5000, Math.round((budgetJpy ?? 15000) * 0.85));

  const priceHistory = summarizeHistory(comparablePrices.length > 0 ? comparablePrices : [productJpy]);

  const productIdr = Math.round(productJpy * rate);
  const fee = Math.round(productIdr * feeRate);
  const tax = Math.round((productIdr + fee) * taxRate);
  const membershipDiscount = Math.round(productIdr * 0.03);
  const pointsUsed = Math.min(25000, Math.round(productIdr * 0.01));

  const reasons: string[] = [];
  let score = 45;

  if (input.url?.trim()) {
    score += 20;
    reasons.push("Sumber URL produk langsung tersedia");
  }

  if (scrapedPrice) {
    score += 20;
    reasons.push("Harga produk utama berhasil dibaca otomatis");
  } else {
    reasons.push("Harga utama memakai estimasi berbasis data pembanding");
  }

  if (priceHistory.samples >= 4) {
    score += 15;
    reasons.push(`Histori harga memiliki ${priceHistory.samples} sampel pembanding`);
  } else if (priceHistory.samples >= 2) {
    score += 8;
    reasons.push("Histori harga tersedia tapi sampel masih terbatas");
  } else {
    reasons.push("Histori harga sangat terbatas");
  }

  if (priceHistory.samples > 0 && priceHistory.minJpy > 0) {
    const spreadRatio = (priceHistory.maxJpy - priceHistory.minJpy) / priceHistory.minJpy;
    if (spreadRatio < 0.2) {
      score += 10;
      reasons.push("Variasi harga antarsumber cukup stabil");
    } else if (spreadRatio > 0.6) {
      score -= 10;
      reasons.push("Variasi harga antarsumber tinggi, perlu validasi manual");
    }
  }

  score = Math.max(30, Math.min(98, score));

  return {
    product: scraped?.title || keyword,
    sourceUrl: input.url?.trim() || scraped?.url,
    marketplace: inferMarketplace(input.url, scraped?.marketplace || "Marketplace Jepang"),
    productJpy,
    rate,
    fee,
    shipping,
    tax,
    membershipDiscount,
    pointsUsed,
    confidenceScore: score,
    confidenceLabel: confidenceLabel(score),
    confidenceReasons: reasons,
    priceHistory,
    similarCount: comparablePrices.length,
  };
}
