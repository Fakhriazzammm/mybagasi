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
```
