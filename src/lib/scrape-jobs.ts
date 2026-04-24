import { appConfig } from '@/lib/runtime-config'
import { supabase } from '@/lib/supabase'
import { scrapeProduct } from './scraper'
import type { ProductData } from './scraper'
import { isScrapeUnusable } from './ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapeJobResult {
  id: string
  url: string
  status: string
  result?: ProductData
  error?: string
}

export interface ScrapeProductWithFallbackResult {
  product?: ProductData
  error?: string
  source: 'direct' | 'async'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = appConfig.backendBaseUrl

function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed'
}

// ---------------------------------------------------------------------------
// 1. createScrapeJob
// ---------------------------------------------------------------------------

export async function createScrapeJob(
  url: string,
  userId?: string,
): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/scrape-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      job_type: 'scrape_product',
      user_id: userId ?? null,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(
      `Failed to create scrape job (${res.status}): ${err.detail ?? res.statusText}`,
    )
  }

  const data = await res.json()
  return { jobId: data.job_id }
}

// ---------------------------------------------------------------------------
// 2. pollScrapeJob
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 60 // 2 minutes

export async function pollScrapeJob(jobId: string): Promise<ScrapeJobResult> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API_BASE}/scrape-status/${jobId}`)

    if (!res.ok) {
      // Transient error – retry after interval
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      continue
    }

    const job: ScrapeJobResult = await res.json()

    if (isTerminalStatus(job.status)) {
      return job
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  return {
    id: jobId,
    url: '',
    status: 'failed',
    error: 'Polling timed out after 2 minutes without a terminal status.',
  }
}

// ---------------------------------------------------------------------------
// 3. watchScrapeJob
// ---------------------------------------------------------------------------

export function watchScrapeJob(
  jobId: string,
  onResult: (job: ScrapeJobResult) => void,
): { unsubscribe: () => void } {
  let settled = false
  let pollingTimer: ReturnType<typeof setInterval> | null = null

  const done = (job: ScrapeJobResult) => {
    if (settled) return
    settled = true
    if (pollingTimer !== null) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
    onResult(job)
  }

  // --- Realtime subscription -------------------------------------------------
  const channelName = `scrape-job:${jobId}:${Date.now()}`

  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: true } },
  })

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'scrape_jobs',
      filter: `id=eq.${jobId}`,
    },
    (payload) => {
      const row = payload.new as Record<string, unknown> | undefined
      if (!row) return

      const status = (row.status as string) ?? ''
      if (isTerminalStatus(status)) {
        done({
          id: jobId,
          url: (row.url as string) ?? '',
          status,
          result: row.result as ProductData | undefined,
          error: (row.error as string) ?? undefined,
        })
        supabase.removeChannel(channel)
      }
    },
  )

  channel.subscribe((status) => {
    // If the Realtime channel errors or can't connect, fall back to polling
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      supabase.removeChannel(channel)
      startFallbackPolling()
    }
  })

  // --- Fallback polling (started if Realtime fails) --------------------------
  function startFallbackPolling() {
    if (settled) return

    pollingTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/scrape-status/${jobId}`)
        if (!res.ok) return

        const job: ScrapeJobResult = await res.json()
        if (isTerminalStatus(job.status)) {
          done(job)
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 3_000)
  }

  // --- Cleanup ---------------------------------------------------------------
  return {
    unsubscribe: () => {
      if (settled) return
      settled = true
      if (pollingTimer !== null) clearInterval(pollingTimer)
      supabase.removeChannel(channel)
    },
  }
}

// ---------------------------------------------------------------------------
// 4. scrapeProductWithFallback
// ---------------------------------------------------------------------------

const ASYNC_TIMEOUT_MS = 90_000 // 90 seconds

export async function scrapeProductWithFallback(
  url: string,
  userId?: string,
): Promise<ScrapeProductWithFallbackResult> {
  // --- Step 1: Try direct scrape --------------------------------------------
  try {
    const product = await scrapeProduct(url)
    if (!isScrapeUnusable(product)) {
      return { product, source: 'direct' }
    }
    // Direct scrape returned but is unusable – fall through to async
  } catch {
    // Direct scrape threw – fall through to async
  }

  // --- Step 2: Async scrape with Realtime + polling race --------------------
  let jobId: string
  try {
    const { jobId: id } = await createScrapeJob(url, userId)
    jobId = id
  } catch (err) {
    return {
      error: `Direct scrape failed and could not create async job: ${String(err)}`,
      source: 'direct',
    }
  }

  // Race: watchScrapeJob (realtime) + pollScrapeJob (HTTP) + timeout
  return new Promise<ScrapeProductWithFallbackResult>((resolve) => {
    let settled = false

    const finish = (result: ScrapeProductWithFallbackResult) => {
      if (settled) return
      settled = true
      watcher.unsubscribe()
      clearTimeout(timeoutId)
      resolve(result)
    }

    // Realtime watcher
    const watcher = watchScrapeJob(jobId, (job) => {
      if (job.status === 'completed' && job.result) {
        finish({ product: job.result, source: 'async' })
      } else {
        finish({
          error: job.error ?? 'Async scrape job did not return a result.',
          source: 'async',
        })
      }
    })

    // Polling race (pollScrapeJob also resolves the promise)
    pollScrapeJob(jobId).then((job) => {
      if (job.status === 'completed' && job.result) {
        finish({ product: job.result, source: 'async' })
      } else {
        finish({
          error: job.error ?? 'Async scrape job did not return a result.',
          source: 'async',
        })
      }
    })

    // Global timeout
    const timeoutId = setTimeout(() => {
      finish({
        error: 'Async scrape timed out after 90 seconds.',
        source: 'async',
      })
    }, ASYNC_TIMEOUT_MS)
  })
}
