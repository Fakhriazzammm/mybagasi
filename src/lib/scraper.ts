import { appConfig } from "@/lib/runtime-config";

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

const API_BASE = appConfig.backendBaseUrl;
const FALLBACK_BACKEND = appConfig.fallbackBackendBaseUrl;

export async function scrapeProduct(url: string): Promise<ProductData> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  };

  // Primary path: /browse-scrape (Crawl4AI + Sumopod AI fallback)
  // Backward compatibility: fallback to /scrape if /browse-scrape is unavailable.
  const endpoints = ["/browse-scrape", "/scrape"];

  for (const endpoint of endpoints) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, requestInit);
    } catch {
      if (!FALLBACK_BACKEND) continue;
      res = await fetch(`${FALLBACK_BACKEND}${endpoint}`, requestInit);
    }

    if (!res.ok && API_BASE.startsWith("/") && FALLBACK_BACKEND && FALLBACK_BACKEND !== API_BASE) {
      const retry = await fetch(`${FALLBACK_BACKEND}${endpoint}`, requestInit);
      if (retry.ok) {
        return retry.json() as Promise<ProductData>;
      }
    }

    if (res.ok) {
      return res.json() as Promise<ProductData>;
    }

    // If endpoint does not exist, try next endpoint in chain.
    if (res.status === 404) {
      continue;
    }

    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Scraper error ${res.status}: ${err.detail ?? res.statusText}`);
  }

  throw new Error("Backend scraper tidak dapat diakses dan fallback tidak dikonfigurasi.");
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
    if (!FALLBACK_BACKEND) throw new Error("Backend search tidak dapat diakses dan fallback tidak dikonfigurasi.");
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
