# MyBagasi Frontend

## AI Chat + Scraper backend

Fitur AI chat memanggil backend Python untuk:
- scrape produk (`/scrape`)
- create invoice Mayar (`/mayar/*`)

Secara default frontend memanggil path relatif `/api` (cocok untuk mode dev karena diproxy oleh Vite ke `http://localhost:8000`).

Untuk deployment production tanpa Vite proxy, set:

```bash
VITE_BACKEND_BASE_URL=https://<domain-backend-anda>
```

Contoh:

```bash
VITE_BACKEND_BASE_URL=https://api.mybagasi.web.id
```
