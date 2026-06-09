# Core Transaction Flow Optimization — MyBagasi

> **Goal:** Optimalkan 3 halaman paling kritis — AI Shopper → Quotation → Checkout/Payment — jadi seamless, cepat, dan zero-friction untuk customer.

**Status:** Planning ✍️

---

## 🎯 Strategic Context

Dari 30+ halaman, **3 fitur ini yang bikin revenue:**
1. **AI Shopper** — entry point, differentiator
2. **Quotation → Order** — conversion moment
3. **Checkout → Payment** — money moment

Semua halaman lain (wishlist, price alerts, finance, admin) adalah **supporting cast**. Fokus di core flow dulu.

---

## 📊 Current State Assessment

| Flow | Speed | UX | Integrasi | Priority |
|------|-------|----|-----------|----------|
| AI Shopper → Checkout | ⚠️ Manual | ⚠️ OK | ❌ No link to order | **P0** |
| Quotation → Order → Checkout | ✅ Cepat | ✅ Bagus | ✅ order_id passed | **P0** |
| Checkout → Mayar → Status | ⚠️ OK | ⚠️ OK | ⚠️ No status callback | **P1** |
| Payment Status → Order update | ❌ | ⚠️ OK | ❌ No webhook | **P2** |

---

## ✅ PHASE 1 — AI Shopper → Quotation Flow (P0)

### Problem
AI Shopper chat bisa scrape & kasih harga, tapi **gak ada tombol "Dapatkan Quotation"** untuk lanjut ke halaman quotation resmi. User harus manual ke `/quotation` lagi.

### Task 1A: Add "Dapatkan Quotation" button after AI response with scraped product

**Files:**
- Modify: `src/pages/dashboard/AIShopper.tsx`

**Current:** Setelah AI merespon dengan scraped product, user cuma bisa lihat info — gak ada CTA untuk lanjut ke quotation.

**Fix:** Tambah tombol di assistant message bubble ketika `scrapedProduct` ada:

```tsx
// Di sebelah card scraped product (setelah line 315, sebelum </div>)
{m.scrapedProduct && (
  <Button
    variant="hero"
    size="sm"
    className="mt-3 w-full gap-1.5"
    onClick={() => navigate(
      `/quotation?url=${encodeURIComponent(m.scrapedProduct.url)}`
    )}
  >
    <Sparkles className="h-3.5 w-3.5" />
    Dapatkan Quotation Resmi
    <ArrowRight className="h-3.5 w-3.5" />
  </Button>
)}
```

**Also needed:** Import `useNavigate` + `ArrowRight` icon.

**Verifikasi:** AI scrape product → muncul tombol "Dapatkan Quotation" → klik → masuk ke `/quotation?url=...` dengan data terisi otomatis.

**⚠️ Catatan:** `navigate()` hanya bisa dipanggil dari dalam komponen React, bukan dari luar. Perlu deklarasi `const navigate = useNavigate()` di function body.

### Task 1B: Pre-fill Quotation URL from query params

**Check existing:** Quotation.tsx line 53: `const [quoteUrl, setQuoteUrl] = useState(searchParams.get("url") ?? "");`
**Also line 260:** `defaultValue={searchParams.get("url") ?? ""}`

✅ **Already implemented** — url query param sudah dihandle. Verifikasi saja bahwa flow AI Shopper → `/quotation?url=<encoded-url>` berfungsi.

### Task 1C: Add "Lanjut ke Checkout" from AI Shopper when paymentUrl exists

**Files:**
- Modify: `src/pages/dashboard/AIShopper.tsx`

**Current:** Ketika AI sudah generate payment URL, tombol "Bayar Sekarang" langsung redirect ke Mayar.

**Fix:** Tambah opsi "Lanjut ke Checkout" yang redirect ke `/checkout?product=...&price=...&url=...` agar user bisa review dulu:

```tsx
// Setelah tombol "Bayar Sekarang" (setelah line 287)
{m.paymentUrl && (
  <Button
    variant="outline"
    size="sm"
    className="mt-2 w-full gap-1.5"
    onClick={() => navigate(
      `/checkout?product=${encodeURIComponent(m.scrapedProduct?.title || "Produk")}&price=${m.scrapedProduct?.price_jpy ? m.scrapedProduct.price_jpy * 105 : 0}&url=${encodeURIComponent(m.scrapedProduct?.url || "")}`
    )}
  >
    <CreditCard className="h-3.5 w-3.5" />
    Review & Checkout
  </Button>
)}
```

**Mobile note:** On mobile (<640px), ubah grid dari 2 kolom ke 1 kolom via `grid-cols-1` di container tombol.

---

## ✅ PHASE 2 — Checkout Flow Optimization (P0)

### Problem
Checkout page hanya baca `order_id` dari URL param tapi **tidak fetch data order dari DB**. Kalau user datang dari AI Shopper (tanpa order_id), data harus di-pass manual via query params yang rawan hilang.

### Task 2A: Fetch order data from DB when order_id is present

**Files:**
- Modify: `src/pages/CheckoutPage.tsx`

**Current:** Line 22-24: `const productName = params.get("product") ...` — selalu baca dari URL params.

**Fix:** Jika `order_id` ada di URL, fetch dari Supabase:

```tsx
// Di function body, setelah params
const orderId = params.get("order_id");
const [dbOrder, setDbOrder] = useState(null);

useEffect(() => {
  if (orderId) {
    supabase.from('orders').select('*').eq('id', orderId).single()
      .then(({ data, error }) => {
        if (!error && data) setDbOrder(data);
      });
  }
}, [orderId]);

// Ganti logika penentuan product name & price:
const productName = dbOrder?.product ?? params.get("product") ?? "Produk dari Jepang";
const productPrice = dbOrder?.total ?? parseInt(params.get("price") ?? "0", 10);
```

**Import tambahan:** `import { supabase } from '@/lib/supabase'`

### Task 2B: Add loading state for DB fetch

**Files:**
- Modify: `src/pages/CheckoutPage.tsx`

Tambahkan `const [loadingOrder, setLoadingOrder] = useState(true)` dan show skeleton saat fetch order dari DB. Skeleton: 3 baris shimmer di ringkasan order.

### Task 2C: Show proper back link based on origin

**Files:**
- Modify: `src/pages/CheckoutPage.tsx`

**Current:** Line 78-83 — hardcoded "Kembali ke AI Shopper"
**Fix:** Deteksi `document.referrer` atau param `from`:

```tsx
// Ganti back link jadi dinamis
const backLink = params.get("from") || "/dashboard/ai-shopper";
const backLabel = params.get("from") === "/quotation" ? "Kembali ke Quotation" : "Kembali ke AI Shopper";
```

---

## ✅ PHASE 3 — Payment Flow Improvement (P1)

### Problem
Payment Status page gak sinkronin status ke Supabase. Kalau user bayar, order di Supabase tetap `draft` sampai admin manual update.

### Task 3A: Update order status when payment confirmed

**Files:**
- Modify: `src/pages/PaymentStatusPage.tsx`

**Current:** Saat `status?.status === "paid"`, hanya tampilkan UI sukses.

**Fix:** Panggil `ordersService.updateStatus()` jika order_id ada di URL:

```tsx
// Di useEffect fetchStatus
if (data.status === "paid" && orderId && !statusUpdatedRef.current) {
  try {
    await supabase.from('orders')
      .update({ status: 'confirmed', paid_at: new Date().toISOString() })
      .eq('id', orderId);
    statusUpdatedRef.current = true;
  } catch (e) {
    console.error("Failed to update order status:", e);
  }
}
```

**Butuh:** `const orderId = params.get("order_id");` + `useRef` untuk guard.

### Task 3B: Add payment method display

**Files:**
- Modify: `src/pages/PaymentStatusPage.tsx`

**Current:** Line 81-92 — cuma tampilin Invoice ID, Total, Nama.
**Fix:** Tambah info pembayaran dari Mayar response (jika available):

```tsx
{status.payment_method && (
  <p>Metode: <span className="text-foreground">{status.payment_method}</span></p>
)}
{status.paid_at && (
  <p>Dibayar: <span className="text-foreground">{new Date(status.paid_at).toLocaleString("id-ID")}</span></p>
)}
```

---

## ✅ PHASE 4 — UX & Performance (P1)

### Task 4A: Add optimistic UI for loading states

**Files:**
- Modify: `src/pages/dashboard/AIShopper.tsx`
- Modify: `src/pages/Quotation.tsx`

**AI Shopper:** Tambah animated typing indicator yang lebih smooth — saat ini pakai 3 dots dengan `animate-pulse-soft`. Udah OK. Skip.

**Quotation:** Saat submit, langsung show skeleton quotation card (bukan spinner di button). Tambah `min-h` yang cocok dengan hasil quote agar layout tidak jump.

### Task 4B: Fix mobile layout for AI Shopper

**Files:**
- Modify: `src/pages/dashboard/AIShopper.tsx`

**Current:** Line 214-215: `height: "calc(100vh - 260px)"`
**Fix:** Kurangi offset untuk mobile:

```tsx
style={{ height: "calc(100vh - 280px)", minHeight: 420 }}
// Mobile: lebih kecil karena header lebih pendek
```

Tambahkan `max-w-2xl` untuk desktop centering:
```tsx
className="flex flex-col rounded-3xl border border-border/40 shadow-soft overflow-hidden mx-auto w-full max-w-2xl"
```

### Task 4C: Add keyboard shortcut for quick send

**Files:**
- Modify: `src/pages/dashboard/AIShopper.tsx`

**Current:** Cuma `Enter` untuk send.
**Fix:** Tambah Cmd+Enter juga, dan auto-focus input setelah response diterima (already done line 120).

---

## ✅ PHASE 5 — Admin Notification (P2)

### Task 5A: Add order notification to admin when new order created

**Files:**
- Modify: `src/lib/mayar.ts` or `src/services/orders.service.ts`

Buat utility function yang kirim notifikasi ke admin Telegram / dashboard ketika order baru dibuat dengan status `confirmed`.

**Abstraksi:** Bisa pakai Supabase Edge Function atau polling dari admin panel. Untuk MVP, cukup tambah notifikasi di Super Admin OpsCommandCenter.

**Opsional — skip untuk fase 1.**

---

## 📋 Implementation Order

```
PHASE 1: AI Shopper → Quotation
├── Task 1A: Add "Dapatkan Quotation" button
├── Task 1B: Verify URL pre-fill (already done)
└── Task 1C: Add "Review & Checkout" from AI

PHASE 2: Checkout Flow
├── Task 2A: Fetch order from DB when order_id present
├── Task 2B: Add loading skeleton
└── Task 2C: Dynamic back link

PHASE 3: Payment Flow
├── Task 3A: Update order status on paid
└── Task 3B: Add payment method display

PHASE 4: UX Polish
├── Task 4B: Mobile layout fix
├── Task 4C: Keyboard shortcut
└── (Task 4A skipped - already OK)

PHASE 5: Admin Notification (deferred)
```

---

## 🔥 Dependency Graph & Parallel Execution

```
📊 Dependency Graph:

PHASE 1 — semua independen satu sama lain:
  [1A] AI Shopper → Quotation button
  [1C] AI Shopper → Checkout button
  → Bisa paralel! (modify same file = sequential)

PHASE 2 — independen dari Phase 1:
  [2A] Checkout DB fetch
  [2B] Loading skeleton
  → Modify same file (CheckoutPage.tsx) = sequential

PHASE 3 — independen dari Phase 1 & 2:
  [3A] Payment status → order update
  [3B] Payment method display
  → Modify same file (PaymentStatusPage.tsx) = sequential

PHASE 4A — independen:
  [4B] Mobile layout
  [4C] Keyboard shortcut
  → Modify same file (AIShopper.tsx) = sequential

Wave 1 (paralel 🔥):
  ├── [1A+1C] AI Shopper buttons
  ├── [2A+2B] Checkout optimization
  └── [3A+3B] Payment flow

Wave 2 (sequential):
  └── [4B+4C] Mobile & UX polish

Wave 3 (verifikasi):
  └── Build + typecheck + browser test
```

---

## 🧪 Verification Plan

### Perubahan UI:
1. AI Shopper → Kirim link produk → AI scrape → muncul tombol "Dapatkan Quotation" + "Review & Checkout"
2. Klik "Dapatkan Quotation" → redirect ke `/quotation?url=...` → form terisi otomatis
3. Klik "Review & Checkout" → redirect ke `/checkout?product=...&price=...&url=...`
4. Di checkout dengan `order_id` → data di-fetch dari DB
5. Bayar via Mayar → redirect ke `/payment/status` → status paid → order update ke `confirmed`

### Build verification:
```bash
cd /opt/mybagasi && npx tsc --noEmit
npm run build
```

### Browser test:
- Buka AI Shopper
- Test suggestion buttons
- Test manual input
- Verifikasi tombol quotation muncul
- Test mobile viewport (375px)

---

## ⚡ Quick Wins (bisa selesai < 30 menit)

1. ✅ AI Shopper → tombol "Dapatkan Quotation" — **~10 menit**
2. ✅ AI Shopper → tombol "Review & Checkout" — **~10 menit**
3. ⏳ Checkout DB fetch — **~15 menit**
4. ⏳ Payment status sync — **~15 menit**
5. ⏳ Mobile layout fix — **~5 menit**

Total: **~55 menit** untuk semua P0 + P1.

---

## 🚫 Tidak Dilakukan (Sengaja Dilewati)

| Item | Alasan |
|------|--------|
| Webhook Mayar → Supabase | Butuh development di backend Python, bisa fase berikutnya |
| Admin notification Telegram | Tidak langsung berdampak ke customer |
| Super Admin ops center improvement | Hanya untuk internal, bisa nanti |
| Refactor besar komponen | Risiko tinggi, manfaat rendah untuk ukuran bisnis saat ini |
| Migration database baru | Semua sudah ada, cukup optimasi query |
