const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const asNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const removeTrailingSlash = (value: string): string => value.replace(/\/$/, '')

const backendBase = clean(import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? '/api'
const fallbackBackend = clean(import.meta.env.VITE_FALLBACK_BACKEND_BASE_URL as string | undefined)

export const appConfig = {
  backendBaseUrl: removeTrailingSlash(backendBase),
  fallbackBackendBaseUrl: fallbackBackend ? removeTrailingSlash(fallbackBackend) : undefined,
  openAiBaseUrl: removeTrailingSlash(
    clean(import.meta.env.VITE_OPENAI_BASE_URL as string | undefined) ??
      clean(import.meta.env.OPENAI_BASE_URL as string | undefined) ??
      'https://ai.sumopod.com/v1',
  ),
  openAiModel: clean(import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? 'gpt-4o-mini',
  defaultMayarEmail: clean(import.meta.env.VITE_MAYAR_DEFAULT_EMAIL as string | undefined) ?? '',
  defaultMayarMobile: clean(import.meta.env.VITE_MAYAR_DEFAULT_MOBILE as string | undefined) ?? '',
  appBaseUrl: removeTrailingSlash(
    clean(import.meta.env.VITE_APP_BASE_URL as string | undefined) ??
      (typeof window !== 'undefined' ? window.location.origin : ''),
  ),
  pricing: {
    jpyToIdr: asNumber(clean(import.meta.env.VITE_JPY_TO_IDR as string | undefined), 105),
    serviceFeeRate: asNumber(clean(import.meta.env.VITE_SERVICE_FEE_RATE as string | undefined), 0.15),
    shippingIdr: asNumber(clean(import.meta.env.VITE_SHIPPING_IDR as string | undefined), 250_000),
    taxRate: asNumber(clean(import.meta.env.VITE_TAX_RATE as string | undefined), 0.08),
  },
} as const
