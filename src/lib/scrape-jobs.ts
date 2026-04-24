import { appConfig } from "@/lib/runtime-config";
import { supabase } from "@/lib/supabase";
import { scrapeProduct, searchProducts } from "./scraper";
import type { ProductData } from "./scraper";
import { isScrapeUnusable } from "./ai";

export interface ScrapeJobResult {
  id: string;
  url: string;
  status: string;
  result?: ProductData;
  error?: string;
}

export interface ScrapeProductWithFallbackResult {
  product?: ProductData;
  error?: string;
  source: "direct" | "async" | "fallback_parser";
}

const API_BASE = appConfig.backendBaseUrl;

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

const titleFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const raw = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
    return raw
      .replace(/[-_]/g, " ")
      .replace(/[0-9]{3,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "Produk Jepang";
  }
};

const marketplaceFromUrl = (url: string): string => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("mercari")) return "Mercari";
    if (host.includes("rakuten")) return "Rakuten";
    if (host.includes("amazon")) return "Amazon JP";
    if (host.includes("yahoo")) return "Yahoo Auction";
    if (host.includes("zozo")) return "ZOZOTOWN";
    return host.replace("www.", "");
  } catch {
    return "Marketplace Jepang";
  }
};

function buildFallbackParsedProduct(url: string, candidates: ProductData[]): ProductData | undefined {
  const first = candidates.find((item) => typeof item.price_jpy === "number" || item.price_display);
  if (!first) return undefined;

  return {
    title: first.title || titleFromUrl(url),
    price_jpy: first.price_jpy,
    price_display: first.price_display,
    condition: first.condition || "unknown",
    images: first.images || [],
    description:
      "Harga menggunakan fallback parser dari listing serupa karena halaman utama tidak bisa dibaca penuh.",
    seller: first.seller || null,
    marketplace: marketplaceFromUrl(url),
    available: true,
    url,
    scraped_at: new Date().toISOString(),
    confidence: "low",
    scrape_reason_code: "PARSE_EMPTY",
  };
}

export async function createScrapeJob(url: string, userId?: string): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/scrape-async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      job_type: "scrape_product",
      user_id: userId ?? null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Failed to create scrape job (${res.status}): ${err.detail ?? res.statusText}`);
  }

  const data = await res.json();
  return { jobId: data.job_id };
}

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 60;

export async function pollScrapeJob(jobId: string): Promise<ScrapeJobResult> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API_BASE}/scrape-status/${jobId}`);

    if (!res.ok) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    const job: ScrapeJobResult = await res.json();
    if (isTerminalStatus(job.status)) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    id: jobId,
    url: "",
    status: "failed",
    error: "Polling timed out after 2 minutes without a terminal status.",
  };
}

export function watchScrapeJob(
  jobId: string,
  onResult: (job: ScrapeJobResult) => void,
): { unsubscribe: () => void } {
  let settled = false;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  const done = (job: ScrapeJobResult) => {
    if (settled) return;
    settled = true;
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    onResult(job);
  };

  const channelName = `scrape-job:${jobId}:${Date.now()}`;
  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: true } },
  });

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "scrape_jobs",
      filter: `id=eq.${jobId}`,
    },
    (payload) => {
      const row = payload.new as Record<string, unknown> | undefined;
      if (!row) return;

      const status = (row.status as string) ?? "";
      if (isTerminalStatus(status)) {
        done({
          id: jobId,
          url: (row.url as string) ?? "",
          status,
          result: row.result as ProductData | undefined,
          error: (row.error as string) ?? undefined,
        });
        supabase.removeChannel(channel);
      }
    },
  );

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      supabase.removeChannel(channel);
      startFallbackPolling();
    }
  });

  function startFallbackPolling() {
    if (settled) return;

    pollingTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/scrape-status/${jobId}`);
        if (!res.ok) return;

        const job: ScrapeJobResult = await res.json();
        if (isTerminalStatus(job.status)) {
          done(job);
        }
      } catch {
        // ignore transient polling errors
      }
    }, 3_000);
  }

  return {
    unsubscribe: () => {
      if (settled) return;
      settled = true;
      if (pollingTimer !== null) clearInterval(pollingTimer);
      supabase.removeChannel(channel);
    },
  };
}

const ASYNC_TIMEOUT_MS = 90_000;

export async function scrapeProductWithFallback(url: string, userId?: string): Promise<ScrapeProductWithFallbackResult> {
  try {
    const product = await scrapeProduct(url);
    if (!isScrapeUnusable(product)) {
      return { product, source: "direct" };
    }
  } catch {
    // continue to async
  }

  let jobId: string;
  try {
    const { jobId: id } = await createScrapeJob(url, userId);
    jobId = id;
  } catch (err) {
    const keyword = titleFromUrl(url);
    const candidates = await searchProducts({ keyword, limit: 5 }).catch(() => []);
    const fallbackProduct = buildFallbackParsedProduct(url, candidates);
    if (fallbackProduct) {
      return { product: fallbackProduct, source: "fallback_parser" };
    }
    return {
      error: `Direct scrape failed and could not create async job: ${String(err)}`,
      source: "direct",
    };
  }

  const asyncResult = await new Promise<ScrapeProductWithFallbackResult>((resolve) => {
    let settled = false;

    const finish = (result: ScrapeProductWithFallbackResult) => {
      if (settled) return;
      settled = true;
      watcher.unsubscribe();
      clearTimeout(timeoutId);
      resolve(result);
    };

    const watcher = watchScrapeJob(jobId, (job) => {
      if (job.status === "completed" && job.result) {
        finish({ product: job.result, source: "async" });
      } else {
        finish({
          error: job.error ?? "Async scrape job did not return a result.",
          source: "async",
        });
      }
    });

    pollScrapeJob(jobId).then((job) => {
      if (job.status === "completed" && job.result) {
        finish({ product: job.result, source: "async" });
      } else {
        finish({
          error: job.error ?? "Async scrape job did not return a result.",
          source: "async",
        });
      }
    });

    const timeoutId = setTimeout(() => {
      finish({
        error: "Async scrape timed out after 90 seconds.",
        source: "async",
      });
    }, ASYNC_TIMEOUT_MS);
  });

  if (asyncResult.product && !isScrapeUnusable(asyncResult.product)) {
    return asyncResult;
  }

  const keyword = titleFromUrl(url);
  const candidates = await searchProducts({ keyword, limit: 6 }).catch(() => []);
  const fallbackProduct = buildFallbackParsedProduct(url, candidates);
  if (fallbackProduct) {
    return { product: fallbackProduct, source: "fallback_parser" };
  }

  return asyncResult;
}
