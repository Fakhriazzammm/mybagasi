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

const SHIPPING_RATES: Record<string, number> = {
  fashion: 125_000,
  skincare: 105_000,
  elektronik: 150_000,
  buku: 60_000,
  food: 150_000,
};

export function getShippingRate(category: string): number {
  return SHIPPING_RATES[category] ?? 125_000;
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
  const shipping = getShippingRate(shippingCategory ?? "general");
  const tax = Math.round((resolvedPriceIdr + fee) * 0.11);
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
