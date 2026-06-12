import { useQuery } from "@tanstack/react-query";
import { appConfig } from "@/lib/runtime-config";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  category: string;
  sub_category: string | null;
  name: string;
  description: string | null;
  price_jpy: number | null;
  price_idr: number | null;
  currency: string | null;
  images: string[];
  source: string | null;
  marketplace: string | null;
  url: string | null;
  tags: string[];
  shipping_category: string | null;
  sort_order: number;
}

export interface CatalogCategory {
  name: string;
  count: number;
  sub_categories: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = appConfig.backendBaseUrl;

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Catalog API error ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  return res.json();
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useFeaturedProducts() {
  return useQuery<CatalogItem[]>({
    queryKey: ["catalog", "featured"],
    queryFn: () =>
      fetchJson<{ items: CatalogItem[] }>("/catalog/featured").then(
        (d) => d.items,
      ),
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}

export function useCatalogCategories() {
  return useQuery<CatalogCategory[]>({
    queryKey: ["catalog", "categories"],
    queryFn: () =>
      fetchJson<{ categories: CatalogCategory[] }>(
        "/catalog/categories",
      ).then((d) => d.categories),
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}

export function useCatalogSearch(keyword: string, category?: string) {
  return useQuery<CatalogItem[]>({
    queryKey: ["catalog", "search", keyword, category],
    queryFn: () => {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (category) params.set("category", category);
      return fetchJson<{ items: CatalogItem[] }>(
        `/catalog/search?${params.toString()}`,
      ).then((d) => d.items);
    },
    enabled: keyword.length > 0,
    staleTime: 1000 * 60 * 2,
    retry: 1,
  });
}

export interface CatalogCategoryResponse {
  category: string;
  items: CatalogItem[];
  total: number;
  sub_categories: string[];
}

export function useCatalogCategory(
  name: string,
  subCategory?: string,
  limit = 50,
  offset = 0
) {
  return useQuery<CatalogCategoryResponse>({
    queryKey: ["catalog", "category", name, subCategory, limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({ name, limit: String(limit), offset: String(offset) });
      if (subCategory) params.set("sub_category", subCategory);
      return fetchJson<CatalogCategoryResponse>(`/catalog/category?${params.toString()}`);
    },
    enabled: !!name,
    staleTime: 1000 * 60 * 2,
    retry: 1,
  });
}
