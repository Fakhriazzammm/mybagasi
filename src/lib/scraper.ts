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
}

const API_BASE = (
  (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? "/api"
).replace(/\/$/, "");

export async function scrapeProduct(url: string): Promise<ProductData> {
  const res = await fetch(`${API_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Scraper error ${res.status}: ${err.detail ?? res.statusText}`);
  }

  return res.json() as Promise<ProductData>;
}
