# MyBagasi Frontend

## AI Chat + Scraper backend

Fitur AI chat memanggil backend Python untuk:
- scrape produk (`/scrape`)
- create invoice Mayar (`/mayar/*`)
- call LLM provider (`https://ai.sumopod.com/v1`)

Secara default frontend memanggil path relatif `/api` (cocok untuk mode dev karena diproxy oleh Vite ke `http://localhost:8000`).

Untuk deployment production tanpa Vite proxy, set:

```bash
VITE_BACKEND_BASE_URL=https://<domain-backend-anda>
```

Contoh:

```bash
VITE_BACKEND_BASE_URL=https://api.mybagasi.web.id
```

## Environment minimum untuk fitur AI

Tambahkan variabel berikut di `.env`:

```bash
VITE_SUMOPOD_API_KEY=<api-key-sumopod-anda>
VITE_BACKEND_BASE_URL=http://localhost:8000
VITE_MAYAR_DEFAULT_EMAIL=cs@mybagasi.id
VITE_MAYAR_DEFAULT_MOBILE=081234567890
VITE_APP_BASE_URL=http://localhost:8080
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_JPY_TO_IDR=105
VITE_SERVICE_FEE_RATE=0.15
VITE_SHIPPING_IDR=250000
VITE_TAX_RATE=0.08
```

## Integrasi realtime (Frontend ↔ Supabase)

Hook data utama (`orders`, `quotations`, `payments`) sudah subscribe ke Supabase Realtime (`postgres_changes`) dan akan invalidate cache React Query saat ada INSERT/UPDATE/DELETE agar UI sinkron otomatis.

Pastikan Realtime aktif di project Supabase dan tabel terkait diikutkan di publication.

## Integrasi VPS Backend ↔ Frontend

- Frontend menggunakan `VITE_BACKEND_BASE_URL` sebagai endpoint utama backend.
- Jika punya backend cadangan, set `VITE_FALLBACK_BACKEND_BASE_URL` (opsional, tidak lagi hardcoded).
- Backend Python menggunakan `CORS_ORIGINS` untuk allowlist domain frontend (dipisah koma), sehingga deployment VPS lebih aman daripada `*`.
- Contoh production `CORS_ORIGINS`: `https://mybagasi.vercel.app,https://www.mybagasi.vercel.app,https://43.129.54.5.nip.io,http://localhost:8080,http://127.0.0.1:8080`
