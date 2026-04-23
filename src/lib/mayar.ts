// Mayar Headless API client — all calls route through /api/mayar/* (Vite proxy → Python backend)
import { appConfig } from "@/lib/runtime-config";

export interface MayarProduct {
  id: string;
  name: string;
  amount: number | null;
  type: string;
  status: string;
  description: string;
  link: string;
  coverImage: { id: string; fileType: string; url: string } | null;
  multipleImage: Array<{ id: string; fileType: string; url: string }> | null;
}

export interface MayarInvoiceResult {
  id: string;
  transactionId: string;
  link: string;
}

export interface MayarInvoiceStatus {
  id: string;
  amount: number;
  status: "created" | "paid" | "expired" | "cancelled";
  customer: {
    id: string;
    email: string;
    mobile: string;
    name: string;
  };
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
}

export interface CreateInvoiceInput {
  name: string;
  email: string;
  mobile: string;
  description: string;
  redirectUrl?: string;
  expiredAt?: string;
  items: InvoiceItem[];
}

const API_BASE = appConfig.backendBaseUrl;
const FALLBACK_BACKEND = appConfig.fallbackBackendBaseUrl;
const BASE = `${API_BASE}/mayar`;
const FALLBACK_BASE = FALLBACK_BACKEND ? `${FALLBACK_BACKEND}/mayar` : "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const requestInit: RequestInit = {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, requestInit);
  } catch {
    if (!FALLBACK_BASE) throw new Error("Backend API tidak dapat diakses dan fallback tidak dikonfigurasi.");
    res = await fetch(`${FALLBACK_BASE}${path}`, requestInit);
  }

  if (!res.ok && API_BASE.startsWith("/") && FALLBACK_BACKEND && FALLBACK_BACKEND !== API_BASE) {
    const retry = await fetch(`${FALLBACK_BASE}${path}`, requestInit);
    if (retry.ok) {
      return retry.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      (err as { detail?: string }).detail ?? `Mayar error ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

export async function listProducts(page = 1, pageSize = 10) {
  return apiFetch<{
    data: MayarProduct[];
    hasMore: boolean;
    pageCount: number;
    page: number;
    pageSize: number;
  }>(`/products?page=${page}&pageSize=${pageSize}`);
}

export async function getProduct(id: string) {
  return apiFetch<{ statusCode: number; data: MayarProduct }>(
    `/products/${id}`
  );
}

export async function createInvoice(
  payload: CreateInvoiceInput
): Promise<MayarInvoiceResult> {
  const res = await apiFetch<{
    statusCode: number;
    data: MayarInvoiceResult;
  }>("/invoice/create", { method: "POST", body: JSON.stringify(payload) });
  return res.data;
}

export async function getInvoice(id: string): Promise<MayarInvoiceStatus> {
  const res = await apiFetch<{
    statusCode: number;
    data: MayarInvoiceStatus;
  }>(`/invoice/${id}`);
  return res.data;
}

export async function createCustomer(
  name: string,
  email: string,
  mobile: string
) {
  return apiFetch("/customer/create", {
    method: "POST",
    body: JSON.stringify({ name, email, mobile }),
  });
}
