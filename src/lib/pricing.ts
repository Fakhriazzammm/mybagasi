import { appConfig } from "@/lib/runtime-config";

export interface PriceEstimate {
  priceJpy: number;
  priceIdr: number;
  fee: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
}

const SHIPPING_RATES: Record<string, { base_kg: number; price_jpy_per_kg: number }> = {
  skincare: { base_kg: 0.3, price_jpy_per_kg: 1500 },
  obat: { base_kg: 0.3, price_jpy_per_kg: 1400 },
  food: { base_kg: 0.3, price_jpy_per_kg: 1400 },
  fashion: { base_kg: 0.5, price_jpy_per_kg: 1200 },
  sepatu: { base_kg: 0.8, price_jpy_per_kg: 1200 },
  jam: { base_kg: 0.4, price_jpy_per_kg: 1300 },
  elektronik: { base_kg: 0.5, price_jpy_per_kg: 1500 },
  general: { base_kg: 0.5, price_jpy_per_kg: 1300 },
};

export function getShippingRate(category: string, jpyToIdr: number): number {
  const cat = category.toLowerCase().strip ? category.toLowerCase().trim() : category.toLowerCase();
  const rate_info = SHIPPING_RATES[cat] ?? SHIPPING_RATES.general;
  const cost_jpy = rate_info.base_kg * rate_info.price_jpy_per_kg;
  return Math.round(cost_jpy * jpyToIdr);
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

function calculateFee(priceIdr: number): number {
  if (priceIdr < 1_000_000) return 100_000;
  if (priceIdr < 3_000_000) return 300_000;
  if (priceIdr < 5_000_000) return 500_000;
  if (priceIdr < 10_000_000) return 1_000_000;
  return 2_000_000;
}

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

  const fee = calculateFee(resolvedPriceIdr);
  const shipping = getShippingRate(shippingCategory ?? "general", jpyToIdr);
  const tax = Math.round(resolvedPriceIdr * 0.11);
  const total = resolvedPriceIdr + fee + shipping + tax;

  return {
    priceJpy: resolvedPriceJpy,
    priceIdr: resolvedPriceIdr,
    fee,
    shipping,
    tax,
    total,
    currency: "IDR",
  };
}
