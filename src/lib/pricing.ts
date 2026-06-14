import { appConfig } from "@/lib/runtime-config";

export interface PriceEstimate {
  priceJpy: number;
  priceIdr: number;
  fee: number;
  shipping: number;
  tax: number;
  total: number;
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

/** Distribusi profit — fee:ongkir:pajak = 40:35:25 (acak, gak kelihatan rata) */
const DISTRIBUTION_RATIO = { fee: 40, shipping: 35, tax: 25 };

function calculateTargetProfit(priceIdr: number): number {
  for (const tier of PROFIT_TIERS) {
    if (tier.min <= priceIdr && priceIdr <= tier.max) {
      return tier.profit;
    }
  }
  return PROFIT_TIERS[PROFIT_TIERS.length - 1].profit;
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
 * Single source of truth untuk estimasi harga.
 * HARUS sama persis dengan bot estimate_price_v2().
 *
 * Sistem:
 * - Profit dari tier didistribusi 33:34:33 ke fee/ongkir/pajak
 * - Fee, ongkir, pajak = bagian dari profit (bukan persentase/tambahan)
 * - Total = harga barang + fee + ongkir + pajak
 */
export function calculatePriceEstimate(params: {
  priceJpy?: number;
  priceIdr?: number;
}): PriceEstimate {
  const { priceJpy, priceIdr } = params;

  const jpyToIdr = appConfig.pricing.jpyToIdr;

  const resolvedPriceIdr: number =
    priceIdr ?? (priceJpy != null ? Math.round(priceJpy * jpyToIdr) : 0);

  const resolvedPriceJpy: number =
    priceJpy ?? (priceIdr != null ? Math.round(priceIdr / jpyToIdr) : 0);

  // Profit dari tier
  const targetProfit = calculateTargetProfit(resolvedPriceIdr);

  // Distribusi 33:34:33
  const total = DISTRIBUTION_RATIO.fee + DISTRIBUTION_RATIO.shipping + DISTRIBUTION_RATIO.tax;
  const fee = Math.round(targetProfit * DISTRIBUTION_RATIO.fee / total);
  let shipping = Math.round(targetProfit * DISTRIBUTION_RATIO.shipping / total);
  const tax = Math.round(targetProfit * DISTRIBUTION_RATIO.tax / total);

  // Sisa pembulatan masuk ke shipping
  const remainder = targetProfit - (fee + shipping + tax);
  shipping += remainder;

  return {
    priceJpy: resolvedPriceJpy,
    priceIdr: resolvedPriceIdr,
    fee,
    shipping,
    tax,
    total: resolvedPriceIdr + fee + shipping + tax,
  };
}
