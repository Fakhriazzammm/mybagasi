import { appConfig } from "@/lib/runtime-config";

export interface PriceEstimate {
  priceJpy: number;
  priceIdr: number;
  fee: number;
  shipping: number;
  tax: number;
  total: number;
  shippingCategory: string;
  shippingNote: string;
}

/**
 * Profit tiers — HARUS konsisten dengan bot scraper/telegram_bot.py _FALLBACK_TIERS
 */
const PROFIT_TIERS: { min: number; max: number; profit: number }[] = [
  { min: 0, max: 999999, profit: 100000 },
  { min: 1000000, max: 2999999, profit: 300000 },
  { min: 3000000, max: 4999999, profit: 500000 },
  { min: 5000000, max: 9999999, profit: 1000000 },
  { min: 10000000, max: 999999999, profit: 2000000 },
];

/** Distribusi profit — fee:ongkir:pajak = 33:34:33 (rata) */
const DISTRIBUTION_RATIO = { fee: 33, shipping: 34, tax: 33 };

/**
 * Shipping rates — IDR-based, per category.
 * HARUS konsisten dengan bot: scraper/telegram_bot.py _SHIPPING_RATES
 */
const SHIPPING_RATES: Record<string, { base_kg: number; price_per_kg: number; note: string }> = {
  skincare:  { base_kg: 0.3, price_per_kg: 350000, note: "Kosmetik/cairan" },
  fashion:   { base_kg: 0.5, price_per_kg: 250000, note: "Pakaian, sepatu" },
  elektronik: { base_kg: 0.5, price_per_kg: 300000, note: "Elektronik kecil" },
  buku:      { base_kg: 0.3, price_per_kg: 200000, note: "Buku/majalah" },
  food:      { base_kg: 0.5, price_per_kg: 300000, note: "Makanan/minuman" },
  general:   { base_kg: 0.5, price_per_kg: 250000, note: "Lainnya" },
};

function calculateTargetProfit(priceIdr: number): number {
  for (const tier of PROFIT_TIERS) {
    if (tier.min <= priceIdr && priceIdr <= tier.max) {
      return tier.profit;
    }
  }
  return PROFIT_TIERS[PROFIT_TIERS.length - 1].profit;
}

function distributeProfit(targetProfit: number) {
  const total = DISTRIBUTION_RATIO.fee + DISTRIBUTION_RATIO.shipping + DISTRIBUTION_RATIO.tax;
  const fee = Math.round(targetProfit * DISTRIBUTION_RATIO.fee / total);
  let shippingMarkup = Math.round(targetProfit * DISTRIBUTION_RATIO.shipping / total);
  const taxMarkup = Math.round(targetProfit * DISTRIBUTION_RATIO.tax / total);
  // Sisa pembulatan masuk ke shipping (paling flexible)
  const remainder = targetProfit - (fee + shippingMarkup + taxMarkup);
  shippingMarkup += remainder;
  return { fee, shippingMarkup, taxMarkup };
}

export function getShippingRate(category: string): { cost: number; note: string } {
  const cat = category.toLowerCase().trim();
  const rate_info = SHIPPING_RATES[cat] ?? SHIPPING_RATES.general;
  return {
    cost: Math.round(rate_info.base_kg * rate_info.price_per_kg),
    note: rate_info.note,
  };
}

export function formatRp(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatJpy(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Single source of truth untuk estimasi harga di frontend.
 * HARUS menghasilkan angka yang SAMA persis dengan bot estimate_price_v2().
 *
 * SISTEM:
 * - Ambil target profit dari tier (berdasarkan harga IDR)
 * - Profit didistribusi ke fee/ongkir/pajak dgn rasio 33:34:33
 * - Ongkir: biaya real + markup dari profit
 * - Pajak: 11% standard + markup dari profit
 * - Tidak ada baris 'Profit' terpisah
 */
export function calculatePriceEstimate(params: {
  priceJpy?: number;
  priceIdr?: number;
  shippingCategory?: string;
}): PriceEstimate {
  const { priceJpy, priceIdr, shippingCategory } = params;

  const jpyToIdr = appConfig.pricing.jpyToIdr;

  const resolvedPriceIdr: number =
    priceIdr ?? (priceJpy != null ? Math.round(priceJpy * jpyToIdr) : 0);

  const resolvedPriceJpy: number =
    priceJpy ?? (priceIdr != null ? Math.round(priceIdr / jpyToIdr) : 0);

  // Hitung target profit dari tier
  const targetProfit = calculateTargetProfit(resolvedPriceIdr);

  // Distribusi profit 33:34:33
  const dist = distributeProfit(targetProfit);

  // Fee jasa = bagian profit yang dialokasikan untuk fee
  const fee = dist.fee;

  // Ongkir real + markup
  const { cost: realShipping, note: shippingNote } = getShippingRate(shippingCategory ?? "general");
  const shipping = realShipping + Math.max(0, dist.shippingMarkup);

  // Pajak standard + markup
  const taxRate = appConfig.pricing.taxRate;
  const taxStandard = Math.round((resolvedPriceIdr + fee) * taxRate);
  const tax = taxStandard + Math.max(0, dist.taxMarkup);

  const total = resolvedPriceIdr + fee + shipping + tax;

  return {
    priceJpy: resolvedPriceJpy,
    priceIdr: resolvedPriceIdr,
    fee,
    shipping,
    tax,
    total,
    shippingCategory: shippingCategory ?? "general",
    shippingNote,
  };
}
