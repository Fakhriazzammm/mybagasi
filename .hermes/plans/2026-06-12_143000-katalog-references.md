# Plan: Halaman `/katalog` — Katalog Produk Referensi MyBagasi

## Goal

Membangun **halaman katalog produk referensi** (`/katalog`) yang menampilkan seluruh 216+ gambar referensi yang sudah di-download ke `public/images/references/`, lengkap dengan data harga, judul, deskripsi per kategori — terintegrasi penuh dengan AI Personal Shopper (`/aipersonalshopper`), Telegram bot, dan checkout Mayar.

---

## Current Context

### ✅ Existing Infrastructure

| Komponen | Status | Detail |
|----------|--------|--------|
| `/aipersonalshopper` | ✅ Ada | Chat AI dengan scraping + search + quotation + checkout |
| AI Backend | ✅ Ada | DeepSeek API via `ai_proxy.py`, `streamChatCompletion`, `searchProducts` |
| Telegram Bot | ✅ Ada | `/beli`, `/cek`, wishlist, quotation, checkout via Mayar |
| Mayar Payment | ✅ Ada | Invoice creation + webhook (`mayar_routes.py`) |
| Pricing System | ✅ Ada | Auto-distribusi profit 33:34:33, ongkir dinamis per kategori |
| DB: profiles | ✅ Ada | Auth + Telegram link |
| DB: quotations | ✅ Ada | Quotation history |
| DB: orders | ✅ Ada | Order management |
| DB: bills | ✅ Ada | Mayar invoices |
| DB: wishlist_items | ✅ Ada | Wishlist per user |
| DB: cart_items | ✅ Ada | Cart system |
| DB: pricing_config | ✅ Ada | Kurs, profit tiers, ongkir, pajak, distribusi |
| DB: categories | ✅ Ada | Landing page categories (5 records) |
| Navbar | ✅ Ada | Link: Beranda, AI Shopper, Jadwal, FAQ |
| Gambar Referensi | ✅ Ada | 216+ files di `public/images/references/` (8 kategori utama, sub-kategori) |

### ❌ Belum Ada

| Komponen | Status |
|----------|--------|
| Halaman `/katalog` | ❌ Belum dibuat |
| DB table `catalog_items` | ❌ Belum ada |
| API endpoint katalog | ❌ Belum ada |
| Tool AI untuk query katalog | ❌ Belum ada (bot + web AI cuma bisa scrape/search live) |
| Seed data dari gambar referensi | ❌ Belum ada |
| Navbar link ke /katalog | ❌ Belum ada |
| Tombol "Lihat Katalog" di landing | ❌ Belum ada |
| Section Katalog di halaman `/` (landing) | ❌ Belum ada |

### Struktur Folder Gambar

```
public/images/references/
├── Disney Store/Stitch/          (17 files)
├── Donqi Items/Skincare/         (30 files)
├── Donqi Items/Snack Donqi/      (18 files)
├── Fashion/GU/                   (20 files)
├── Fashion/GU/Special Collections/ (5 files)
├── Fashion/No Brand/             (10 files)
├── Fashion/Uniqlo/               (8 files)
├── Fashion/Uniqlo/Uniqlo x Needle/ (3 files)
├── Gacha/                        (49 files — langsung di folder)
├── Makeup/High End Brand/Chanel/ (8 files)
├── Makeup/High End Brand/Dior/   (8 files)
├── Makeup/High End Brand/YSL/    (5 files)
├── Makeup/Local Brand/Canmake/   (5 files)
├── Makeup/Local Brand/Donqi/     (5 files)
├── Makeup/Local Brand/EMAKED/    (3 files)
├── Makeup/Local Brand/Muji/      (5 files)
├── Sepatu/No Brand (Affordable)/ (5 files)
├── Sepatu/On Cloud/              (3 files)
├── Sepatu/Onitsuka Tiger/        (4 files)
├── Snack/Donqi/                  (10 files)
├── Snack/Muji/Instant Food/      (5 files)
├── Snack/Muji/Snack/             (24 files)
├── Toys/Sanrio/                  (20 files)
├── Toys/Sylvaina/                (15 files)
├── Toys/Sylvaina/New Juni'24/    (15 files)
```

Total: ~216 files (8 kategori utama, 25+ sub-kategori)

---

## Proposed Approach

### Phase 1: Database Catalog

Buat table `catalog_items` di Supabase + seed data dari struktur folder gambar.

### Phase 2: Backend API

Endpoint `/api/catalog/search` dan `/api/catalog/category` di scraper backend (FastAPI) untuk query katalog.

### Phase 3: Halaman Web `/katalog`

Halaman React dengan:
- Grid kategori (card besar per kategori utama)
- Grid produk per kategori (card kecil dengan foto + harga + judul + CTA)
- Filter: per kategori, per range harga, search keyword
- CTA: "Beli via AI", "Lihat Detail", "Tambah ke Wishlist"

### Phase 4: Integrasi AI

Catalog tool untuk AI Personal Shopper (web + bot):
- `search_catalog(keyword)` — cari produk di katalog referensi
- `get_catalog_by_category(category)` — ambil semua produk per kategori
- AI bisa kirim gambar + harga + hitung estimasi → checkout Mayar

### Phase 5: Integrasi Telegram Bot

Handler `/katalog` + tool baru di AI function calling bot untuk query katalog referensi.

---

## Database Schema

### Table: `catalog_items`

```sql
CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,           -- Main category: Fashion, Makeup, Gacha, dll
  sub_category TEXT DEFAULT '',     -- Sub-category: GU, Uniqlo, Chanel, dll
  name TEXT NOT NULL,               -- Product name / title
  description TEXT DEFAULT '',      -- Deskripsi produk
  price_jpy INTEGER,               -- Harga dalam JPY (nullable — will be filled gradually)
  price_idr INTEGER,               -- Harga dalam IDR (nullable)
  currency TEXT DEFAULT 'JPY',      -- JPY / IDR
  images JSONB DEFAULT '[]',        -- Array of image paths ["/images/references/..."]
  source TEXT DEFAULT 'reference',   -- reference, rakuten, amazon_jp, dll
  marketplace TEXT DEFAULT '',       -- Marketplace asal (kalau dari live scrape)
  url TEXT DEFAULT '',               -- URL asli produk
  tags JSONB DEFAULT '[]',           -- Tags untuk search: ["onitsuka", "sepatu", "sneakers"]
  weight_kg DECIMAL(5,2) DEFAULT 0, -- Estimasi berat (untuk ongkir)
  shipping_category TEXT DEFAULT 'general', -- fashion, elektronik, skincare, buku, food, general
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,     -- Urutan dalam kategori
  metadata JSONB DEFAULT '{}',      -- Extra fields: color, size, brand, dll
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_catalog_items_category ON catalog_items(category);
CREATE INDEX idx_catalog_items_active ON catalog_items(active);
CREATE INDEX idx_catalog_items_tags ON catalog_items USING GIN(tags);
CREATE INDEX idx_catalog_items_search ON catalog_items USING GIN(
  to_tsvector('indonesian', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || coalesce(sub_category, ''))
);

-- Auto-update updated_at
CREATE TRIGGER trg_catalog_items_updated_at
  BEFORE UPDATE ON catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: public read, service_role write
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_items_select" ON catalog_items FOR SELECT USING (true);
CREATE POLICY "catalog_items_insert" ON catalog_items FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "catalog_items_update" ON catalog_items FOR UPDATE USING (auth.role() = 'service_role');
```

### Migration Strategy

1. Migration SQL untuk CREATE TABLE `catalog_items`
2. Seed script Python di `/opt/mybagasi/scripts/seed-catalog.py`:
   - Scan seluruh folder `public/images/references/`
   - Generate nama produk dari nama file (strip UUID/acak → nama deskriptif)
   - Assign kategori + sub-kategori dari struktur folder
   - Insert ke Supabase via service_role
   - Sisakan `price_jpy` sebagai NULL — diisi bertahap via admin atau AI

---

## UI/UX Specification

### Design Philosophy

- **Fokus CTA penjualan** — setiap produk punya tombol "Beli via AI" yang prominent
- **Tanpa elemen dekoratif** — no blur orbs, no gradients, no heavy shadows
- **Data-density tinggi** — grid rapat, card minimalis
- **Mobile-first** — 2 kolom di mobile, 3-4 di desktop
- **Loading state** → skeleton grid
- **Empty state** → "Belum ada produk di kategori ini"
- **Error state** → "Gagal memuat katalog. Coba refresh."

### Halaman: `/katalog` (Root)

```
┌─────────────────────────────────────────┐
│ Navbar + search bar                     │
├─────────────────────────────────────────┤
│ Kategori Populer:                       │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│ │👕     │ │💄    │ │👟    │ │🎮    │   │
│ │Fashion│ │Makeup│ │Sepatu│ │Gacha │   │
│ │ 46    │ │ 39   │ │ 12   │ │ 49   │   │
│ └──────┘ └──────┘ └──────┘ └──────┘   │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│ │🍜    │ │🧸    │ │🛍️   │ │🏰    │   │
│ │Snack │ │Toys  │ │Donqi │ │Disney│   │
│ │ 39   │ │ 50   │ │ 48   │ │ 17   │   │
│ └──────┘ └──────┘ └──────┘ └──────┘   │
├─────────────────────────────────────────┤
│ Produk Unggulan (random/acak dari semua)│
│ 4-column grid produk card               │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │foto │ │foto │ │foto │ │foto │       │
│ │judul│ │judul│ │judul│ │judul│       │
│ │harga│ │harga│ │harga│ │harga│       │
│ │[Beli]│ │[Beli]│ │[Beli]│ │[Beli]│       │
│ └─────┘ └─────┘ └─────┘ └─────┘       │
└─────────────────────────────────────────┘
```

### Halaman: `/katalog/:category` (Per Kategori)

```
┌─────────────────────────────────────────┐
│ ← Kembali | Nama Kategori (46 produk)   │
├─────────────────────────────────────────┤
│ Sub-kategori (chip filter):             │
│ [Semua] [GU] [Uniqlo] [No Brand]        │
├─────────────────────────────────────────┤
│ Sort: [Terbaru ▽] [Termurah ▽]          │
├─────────────────────────────────────────┤
│ Grid produk (2 col mobile, 4 col desk)  │
│ ┌────────┐ ┌────────┐ ┌────────┐       │
│ │  foto  │ │  foto  │ │  foto  │       │
│ │Judul   │ │Judul   │ │Judul   │       │
│ │JPY 3,980│ │JPY 2,500│ │JPY 5,200│       │
│ │Rp 450rb│ │Rp 290rb│ │Rp 580rb│       │
│ │[Beli AI]│ │[Beli AI]│ │[Beli AI]│       │
│ └────────┘ └────────┘ └────────┘       │
└─────────────────────────────────────────┘
```

### Halaman Landing `/` — Section "Jelajahi Katalog"

```
┌─────────────────────────────────────────────┐
│ ← section setelah Features / sebelum        │
│   Testimonials                              │
│                                             │
│ .──────────────────────────────.             │
│ | 💎 Jelajahi Katalog Produk   |             │
│ | Koleksi produk Jepang pilihan|             │
│ '──────────────────────────────'             │
│                                             │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│ │👕    │ │💄    │ │👟    │ │🎮    │       │
│ │Fash'n│ │Makeup│ │Sepatu│ │Gacha │       │
│ │46    │ │39    │ │12    │ │49    │       │
│ │produk│ │produk│ │produk│ │produk│       │
│ └──────┘ └──────┘ └──────┘ └──────┘       │
│                                             │
│         [📍 Lihat Semua Katalog]            │
│          tombol hero, full-width CTA        │
│                                             │
│ (4 produk unggulan: foto + nama + harga     │
│  + tombol "Beli via AI")                    │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐                        │
│ │f │ │f │ │f │ │f │                        │
│ │tp│ │tp│ │tp│ │tp│                        │
│ │Rp│ │Rp│ │Rp│ │Rp│                        │
│ └──┘ └──┘ └──┘ └──┘                        │
└─────────────────────────────────────────────┘
```

**Penempatan:** Setelah section `<Features />` dan sebelum `<Testimonials />` di `Index.tsx`.

**Komponen React:** `src/components/landing/KatalogPreview.tsx` — **NEW**
- Query 4 produk unggulan dari catalog_items (random/acak)
- Grid kategori (8 card kecil)
- Tombol "Lihat Semua Katalog" → `/katalog`
- Loading: skeleton; Empty: skip section; Error: skip section (graceful degradation)

**Navigasi dari Landing:**
- Klik card kategori → `/katalog/:category`
- Klik produk unggulan → `/aipersonalshopper?catalog_id=<id>`
- Klik CTA → `/katalog`

---

### Product Card Spec

```
┌─────────────────────┐
│        ┌─────┐      │
│        │foto │      │  aspect-ratio: 1/1
│        │     │      │  object-fit: cover
│        └─────┘      │  rounded-lg
│ Judul Produk        │  text-sm, font-medium, line-clamp-2
│ Kategori · Sub-kat  │  text-xs, text-muted-foreground
│ JPY 3,980           │  text-xs, text-muted-foreground
│ Rp 450.000          │  text-sm, font-semibold, text-primary
│ [🛒 Beli via AI]    │  Button sm, variant hero, full-width
└─────────────────────┘
```

### States

| State | Visual |
|-------|--------|
| Loading | Skeleton grid: 8 card skeletons dengan pulse animation |
| Empty | "Belum ada produk di kategori ini. Cek kategori lain." + link ke /katalog |
| Error | Alert + "Gagal memuat katalog" + tombol "Coba Lagi" |
| Searching | "Mencari..." with spinner + hasil realtime |

---

## Integration Points

### 1. AI Personal Shopper (`/aipersonalshopper`)

**Tool baru: `search_catalog`**

```typescript
// Di ai.ts — tambah fungsi
async function searchCatalog(keyword: string, category?: string): Promise<CatalogItem[]>
async function getCatalogByCategory(category: string): Promise<CatalogItem[]>
```

AI system prompt diperbarui:

```
KAMU PUNYA AKSES KE KATALOG PRODUK REFERENSI:
- MyBagasi punya katalog produk Jepang populer
- Gunakan search_catalog() untuk cari produk di katalog
- Jika user minta rekomendasi, cari di katalog dulu
- Katalog berisi: foto, harga JPY, deskripsi, kategori
- Setelah dapat produk dari katalog, hitung estimasi all-in seperti biasa
- Kirim foto produk + harga + estimasi → user bisa langsung checkout
```

**Alur Chat Baru:**

```
User: "Cari makeup brand Jepang"
→ AI panggil search_catalog("makeup Jepang")
→ Dapat produk dari Makeup/Canmake, Makeup/Muji, dll
→ AI kirim foto + harga + estimasi
→ User klik "Lanjut Beli" → checkout Mayar
```

### 2. Telegram Bot

**Handler baru:**

- `/katalog` — lihat daftar kategori
- `/katalog fashion` — lihat produk fashion
- AI tool `search_catalog` — bot bisa query katalog via function calling

**Tambah tool function baru di bot:**

```python
{
    "name": "search_catalog",
    "description": "Cari produk di katalog referensi MyBagasi",
    "parameters": {
        "keyword": {"type": "string", "description": "Kata kunci pencarian"},
        "category": {"type": "string", "description": "Filter kategori (opsional)"}
    }
}
```

Bot mengirim foto produk via `tg_send_photo` + inline keyboard "Beli" + "Cek Harga".

### 3. Pricing Integration

Setiap produk dari katalog bisa langsung dihitung estimasi all-in menggunakan sistem pricing yang sudah ada:
- Ongkir dinamis per `shipping_category`
- Profit auto-distribusi 33:34:33
- Kurs realtime
- Pajak 11%

### 4. Mayar Checkout

Alur: Katalog → "Beli via AI" → buka AI Personal Shopper dengan produk pre-filled → hitung estimasi → checkout → Mayar invoice.

Link: `/aipersonalshopper?catalog_id=<id>` — AI langsung tau produk mana yang dimaksud.

---

## Multi-source Data Flow

```
┌──────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────┐
│ Katalog  │───→│ AI Personal  │───→│ Hitung Estimasi│───→│ Checkout │
│ (DB)     │    │ Shopper      │    │ (fee+ongkir    │    │ (Mayar)  │
│          │    │ (web/bot)    │    │  +pajak+diskon)│    │          │
└──────────┘    └──────────────┘    └────────────────┘    └──────────┘
     │                │
     │                ▼
     │         ┌──────────────┐
     │         │ Scraper Live │
     │         │ (Amz/Rakuten)│
     │         └──────────────┘
     │
     ▼
┌──────────┐
│ Gambar   │
│ Referensi│
│ (public/ │
│ images/) │
└──────────┘
```

---

## Step-by-Step Plan

### Wave 1: Database + Seed Data (3 subagent paralel 🔥)

| # | Task | Subagent | Dependency |
|---|------|----------|------------|
| 1.1 | Migration SQL: CREATE TABLE `catalog_items` | ✅ Paralel | None |
| 1.2 | Seed script Python: scan folder → generate product data → insert ke Supabase | ✅ Paralel | None |
| 1.3 | API endpoint `/api/catalog/search` + `/api/catalog/category` di scraper backend | ✅ Paralel | None |

### Wave 2: Halaman Web (3 subagent — 2 paralel + 1 sequential dari 2.1)

| # | Task | Subagent | Dependency |
|---|------|----------|------------|
| 2.1 | Halaman `/katalog` (root): grid kategori + produk unggulan | ✅ Paralel | Wave 1 |
| 2.2 | Halaman `/katalog/:category`: grid produk per kategori + filter sub-kategori | ✅ Paralel | Wave 1 |
| 2.3 | Komponen landing `KatalogPreview.tsx` + integrasi ke `Index.tsx` | Saya | Wave 2.1 |

### Wave 3: Integrasi AI + Bot (sequential + paralel)

| # | Task | Dikerjakan | Dependency |
|---|------|------------|------------|
| 3.1 | Tambah hook/service `useCatalog()` di frontend | Saya | Wave 2 |
| 3.2 | Tambah tool `search_catalog` di AI (`ai.ts`) + update system prompt | Saya | Wave 1 |
| 3.3 | Tambah handler `/katalog` + tool di Telegram bot | Subagent | Wave 1 |
| 3.4 | Navbar: tambah link "Katalog" | Saya | Wave 2 |

### Wave 4: Polish & Deploy

| # | Task | Dikerjakan | Dependency |
|---|------|------------|------------|
| 4.1 | Build & typecheck | Saya | Wave 3 |
| 4.2 | Seed data (running script) | Saya | Wave 1.2 |
| 4.3 | Deploy Vercel + push GitHub | Saya | 4.1 |
| 4.4 | Restart bot | Saya | 3.3 |

---

## Files Likely to Change

| File | Perubahan |
|------|-----------|
| `supabase/migrations/20260612000002_catalog_items.sql` | **NEW** — migration |
| `scripts/seed-catalog.py` | **NEW** — seed data generator |
| `scraper/main.py` | Tambah router catalog |
| `scraper/catalog_routes.py` | **NEW** — API endpoints |
| `scraper/telegram_bot.py` | Tambah handler /katalog + tool search_catalog |
| `src/App.tsx` | Tambah route `/katalog` + `/katalog/:category` |
| `src/pages/katalog/KatalogPage.tsx` | **NEW** — halaman utama katalog |
| `src/pages/katalog/CategoryPage.tsx` | **NEW** — halaman per kategori |
| `src/hooks/useCatalog.ts` | **NEW** — hook React Query |
| `src/lib/ai.ts` | Tambah fungsi searchCatalog + update system prompt |
| `src/lib/scraper.ts` | Tambah tipe CatalogItem |
| `src/components/site/Navbar.tsx` | Tambah link "Katalog" |
| `src/components/katalog/ProductCard.tsx` | **NEW** — komponen card produk |
| `src/components/katalog/CategoryCard.tsx` | **NEW** — komponen card kategori |
| `src/components/katalog/CatalogSkeleton.tsx` | **NEW** — skeleton loading |
| `src/components/landing/KatalogPreview.tsx` | **NEW** — section katalog di landing page `/` |
| `src/pages/Index.tsx` | Tambah `<KatalogPreview />` setelah `<Features />` |
| `public/images/references/` | ✅ Sudah ada |

---

## Tests / Validation

| Test | Method |
|------|--------|
| Migration berhasil | `supabase db diff` + query SELECT |
| Seed data | Query `SELECT COUNT(*) FROM catalog_items` → 216+ |
| API /catalog/search?keyword=onitsuka | `curl` → return data produk |
| API /catalog/category?name=Fashion | `curl` → return 46 produk |
| Halaman /katalog | Browser → 8 category cards + product grid |
| Halaman /katalog/fashion | Browser → filter sub-kategori + 46 produk |
| Landing page `/` | Browser → section "Jelajahi Katalog" muncul setelah Features |
| AI search catalog | Chat di /aipersonalshopper → AI bisa cari produk |
| Bot /katalog | Telegram → daftar kategori |
| Bot "cari makeup di katalog" | AI bot → kirim foto + harga |
| End-to-end: Katalog → AI → Estimasi → Checkout | Full flow test |

---

## Risks & Tradeoffs

| Risk | Mitigasi |
|------|----------|
| Harga produk di katalog tidak akurat | Set price_jpy nullable, isi bertahap via admin |
| 216+ gambar loading lambat | Lazy loading + image optimization (Vite built-in) |
| Seed data butuh nama produk deskriptif dari UUID filename | Subfolder name + numbering sebagai nama default |
| Bot kirim foto ukuran besar | Resize otomatis atau compresi |
| Data duplikasi antara katalog & hasil scrape | Katalog = curated, scrape = live — beda source |
| AI bisa akses katalog & scrape bersamaan | Prioritaskan katalog untuk produk umum, scrape untuk link spesifik |

---

## Data Completeness Audit

### Source: Struktur Folder → Target: DB

| Field | Sumber | Method |
|-------|--------|--------|
| category | Parent folder name | Langsung |
| sub_category | Child folder name | Langsung |
| name | Filename (UUID → deskriptif) | Subfolder name + index fallback, manual fill nanti |
| image[] | File path | Langsung |
| price_jpy | NULL (belum tahu) | Diisi manual via admin panel nanti |
| price_idr | NULL | Diisi manual |
| shipping_category | Mapping kategori → ongkir | Rule-based: Fashion→fashion, Makeup→skincare, dll |
| tags | Category + sub-category name | Auto-generate |
| description | NULL | Diisi manual |

---

## Ekspansi yang Bisa Ditawarkan

Setelah plan inti selesai, bisa dikembangkan:

1. **Admin panel** `/admin/catalog` — CRUD produk katalog (isi harga, deskripsi, aktif/nonaktif)
2. **CSV/Excel import** — import massal harga dari spreadsheet
3. **Auto-price from Rakuten/Amazon** — AI scrape otomatis + update harga berkala
4. **Wishlist from katalog** — tombol "Simpan" langsung dari card
5. **Related products** — "Produk serupa" di halaman detail
6. **Katalog → Quotation langsung** — tanpa harus chat AI (one-click quote)
