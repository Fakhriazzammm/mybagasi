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

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS = [350, 900, 1800];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (status: number) => RETRYABLE_STATUS.has(status);

async function fetchWithTieredRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!shouldRetry(response.status)) {
        return response;
      }
      if (attempt < RETRY_DELAYS.length - 1) {
        await sleep(RETRY_DELAYS[attempt]);
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS.length - 1) {
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed after tiered retries.");
}

async function fetchPrimaryWithOptionalFallback(path: string, init: RequestInit): Promise<Response> {
  const primaryUrl = `${API_BASE}${path}`;

  try {
    const primaryRes = await fetchWithTieredRetry(primaryUrl, init);
    if (primaryRes.ok) return primaryRes;

    const shouldTryFallback =
      API_BASE.startsWith("/") &&
      FALLBACK_BACKEND &&
      FALLBACK_BACKEND !== API_BASE &&
      (primaryRes.status === 404 || shouldRetry(primaryRes.status));

    if (shouldTryFallback) {
      return fetchWithTieredRetry(`${FALLBACK_BACKEND}${path}`, init);
    }

    return primaryRes;
  } catch {
    if (!FALLBACK_BACKEND) {
      throw new Error("Backend scraper tidak dapat diakses dan fallback tidak dikonfigurasi.");
    }
    return fetchWithTieredRetry(`${FALLBACK_BACKEND}${path}`, init);
  }
}

export async function scrapeProduct(url: string): Promise<ProductData> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  };

  const endpoints = ["/browse-scrape", "/scrape"];

  for (const endpoint of endpoints) {
    const response = await fetchPrimaryWithOptionalFallback(endpoint, requestInit);

    if (response.ok) {
      return response.json() as Promise<ProductData>;
    }

    if (response.status === 404) {
      continue;
    }

    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(`Scraper error ${response.status}: ${err.detail ?? response.statusText}`);
  }

  throw new Error("Backend scraper tidak dapat diakses dan fallback tidak dikonfigurasi.");
}

export async function searchProducts(input: SearchProductsInput): Promise<ProductData[]> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  };

  const response = await fetchPrimaryWithOptionalFallback("/search", requestInit);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(`Search error ${response.status}: ${err.detail ?? response.statusText}`);
  }

  const json = (await response.json()) as { items?: ProductData[] };
  return json.items ?? [];
}
