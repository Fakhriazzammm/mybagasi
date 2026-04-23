export interface ProductData {
  title: string;
  price_jpy: number | null;
  price_display: string;
  condition: string | null;
  images: string[];
  description: string | null;
  seller: string | null;
  marketplace: string;
  available: boolean;
  url: string;
  scraped_at: string;
  confidence?: "high" | "medium" | "low";
  scrape_reason_code?:
    | "PLAYWRIGHT"
    | "CRAWL4AI"
    | "BLOCKED"
    | "URL_INVALID"
    | "NOT_FOUND"
    | "PARSE_EMPTY"
    | "SCREENSHOT_AI";
}

export interface SearchProductsInput {
  keyword: string;
  condition?: string;
  size?: string;
  limit?: number;
}

const API_BASE = (
  (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? "/api"
).replace(/\/$/, "");
const FALLBACK_BACKEND = (
  (import.meta.env.VITE_FALLBACK_BACKEND_BASE_URL as string | undefined) ??
  "https://43.129.54.5.nip.io"
).replace(/\/$/, "");

export async function scrapeProduct(url: string): Promise<ProductData> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/scrape`, requestInit);
  } catch {
    res = await fetch(`${FALLBACK_BACKEND}/scrape`, requestInit);
  }

  // Production safety net: if relative /api fails (no proxy), retry to VPS backend.
  if (!res.ok && API_BASE.startsWith("/") && FALLBACK_BACKEND && FALLBACK_BACKEND !== API_BASE) {
    const retry = await fetch(`${FALLBACK_BACKEND}/scrape`, requestInit);
    if (retry.ok) {
      return retry.json() as Promise<ProductData>;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Scraper error ${res.status}: ${err.detail ?? res.statusText}`);
  }

  return res.json() as Promise<ProductData>;
}

export async function searchProducts(
  input: SearchProductsInput
): Promise<ProductData[]> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/search`, requestInit);
  } catch {
    res = await fetch(`${FALLBACK_BACKEND}/search`, requestInit);
  }

  if (!res.ok && API_BASE.startsWith("/") && FALLBACK_BACKEND && FALLBACK_BACKEND !== API_BASE) {
    const retry = await fetch(`${FALLBACK_BACKEND}/search`, requestInit);
    if (retry.ok) {
      const json = (await retry.json()) as { items?: ProductData[] };
      return json.items ?? [];
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Search error ${res.status}: ${err.detail ?? res.statusText}`);
  }

  const json = (await res.json()) as { items?: ProductData[] };
  return json.items ?? [];
}
