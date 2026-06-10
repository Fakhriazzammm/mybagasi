# MyBagasi Bot — User-Centric Security Plan

> **Untuk Hermes:** Implementasi task-by-task via profile `mybagasi-ai`. Baca SOUL.md + config.yaml + existing RLS policies sebelum mulai.

**Goal:** Bot hanya bisa akses data user yang sedang chat — tidak bisa baca data user lain, data admin, file VPS, atau konfigurasi Hermes.

**Architecture:**
- **Hapus semua tools berbahaya** dari `config.yaml` — terminal, file, memory, skills, delegation, session_search
- **Ganti service_role key** dengan **anon key + JWT user** — RLS policies yang SUDAH ADA akan otomatis membatasi akses
- **Edge Function** untuk operasi yang butuh akses admin (register user, Mayar invoice)
- **Scraping tetap via web_search / web_extract / browser** — tidak perlu database access

**Status RLS Saat Ini: ✅ RLS sudah ada di semua tabel user!**
Setiap tabel sudah punya policy `auth.uid() = user_id` — masalahnya cuma bot pake `service_role key` yang bypass semua itu.

**Tech Stack:** Hermes config.yaml, Supabase anon key + JWT, Supabase Edge Functions

---

## 📊 Dependency Graph

```
Level 1 (independent → paralel 🔥)
  ├── [1] config.yaml: hapus tools berbahaya
  ├── [2] SOUL.md: update persona & tools section
  └── [3] Script: hapus service_role dari semua skill

Level 2 (independent → paralel 🔥)
  ├── [4] Edge Function: register-user (ganti Auth Admin API langsung)
  ├── [5] Edge Function: create-invoice (ganti Mayar langsung)
  └── [6] Migration: RLS untuk admin ops + bot role

Level 3 (depend on Edge Functions)
  ├── [7] SOUL.md: update semua curl → panggil Edge Function
  ├── [8] Update semua skill: ganti service_role → JWT + anon
  └── [9] Test end-to-end

Level 4 (cleanup)
  └── [10] Hapus service_role key dari .env
```

---

## 🔥 Wave 1: Lockdown — Hapus Akses Berbahaya

### Task 1: config.yaml — Hapus Tools Berbahaya

**Objective:** Bot cuma punya akses web + browser. Tidak bisa terminal, file, atau memory.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/config.yaml`

**Current (berbahaya):**
```yaml
toolsets:
- web
- browser
- terminal     # 🔴 Bisa execute command VPS
- file         # 🔴 Baca/edit file sistem
- memory       # 🟡 Baca memory semua user
- skills       # 🟡 Baca/edit skill files
- delegation   # 🟡 Spawn subagent
- session_search # 🟡 Baca percakapan user lain
- clarify
```

**Sesudah (aman):**
```yaml
toolsets:
- web          # ✅ Scrape marketplace
- browser      # ✅ Scrape JS-rendered pages
- clarify      # ✅ Tanya user kalau kurang jelas
```

**Dampak:**
- ❌ Bot gak bisa `cat .env` → API key aman
- ❌ Bot gak bisa `read_file` → Hermes config aman
- ❌ Bot gak bisa `terminal` → VPS aman
- ❌ Bot gak bisa lihat chat user lain
- ✅ Bot masih bisa scrape produk
- ✅ Bot masih bisa tanya clarifikasi

---

### Task 2: SOUL.md — Update Persona & Tools Section

**Objective:** Tools section di SOUL.md harus sesuai dengan kemampuan baru bot.

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

**Ubah section "Tools & Capabilities":**

```markdown
## Tools & Capabilities

### ✅ Diizinkan
- `web_search` — cari produk di marketplace Jepang (keyword)
- `web_extract` — baca halaman produk langsung
- `browser_navigate` + `browser_vision` — lihat halaman JS-rendered
- `clarify` — tanya user kalau kurang jelas

### ❌ Terlarang
- JANGAN akses filesystem atau terminal
- JANGAN execute kode
- JANGAN expose API key, token, atau credential
- JANGAN ubah konfigurasi sistem
- JANGAN bikin data produk palsu
- JANGAN akses data user lain
```

**Ubah section "Database Supabase (untuk curl)":**
Hapus service_role key reference. Ganti jadi referensi bahwa query data user via **user JWT yang didapat setelah login**.

---

### Task 3: Hapus Service Role dari Semua Skill & AGENTS.md

**Objective:** Semua file di profil mybagasi-ai tidak boleh mengandung `SUPABASE_SERVICE_ROLE_KEY`.

**Files:**
- Modify: `AGENTS.md`, semua skill di `skills/*/SKILL.md`, `scripts/*.sh`, `scripts/*.py`

**Aksi:** Cari semua file dengan grep:
```bash
grep -rn "SERVICE_ROLE_KEY\|suPAB...EY\|service_role" \
  ~/.hermes/profiles/mybagasi-ai/ \
  --include="*.md" --include="*.sh" --include="*.py"
```

Untuk setiap file:
- `SERVICE_ROLE_KEY` → **HAPUS** dari konten (ganti dengan instruksi "gunakan JWT user dari login")
- `SUPAB...EY` / `SUPABASE_SERVICE_ROL...` → **HAPUS**
- Curl yang butuh auth → ganti dengan `"Authorization: Bearer $USER_JWT"`
- Curl untuk tabel user → tambah header `apikey: $SUPABASE_ANON_KEY`

**Konten curl baru (aman — anon key + JWT):**
```bash
# Query data user sendiri — RLS akan filter otomatis
curl -s "$SUPABASE_URL/rest/v1/orders?select=id,product,total,status&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer ***  # JWT dari login user

# INSERT quotation — RLS cek user_id = auth.uid()
curl -s -X POST "$SUPABASE_URL/rest/v1/quotations" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer *** \  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"product":"...","price_jpy":10000,"total":1500000,"status":"active"}'
```

**Catatan:** `user_id` TIDAK perlu dikirim di body — RLS akan otomatis pakai `auth.uid()` dari JWT.

---

## 🔥 Wave 2: Edge Functions untuk Admin Ops

### Task 4: Edge Function — `register-user`

**Objective:** Ganti Auth Admin API langsung (butuh service_role) dengan Edge Function yang terkontrol.

**Files:**
- Create: `supabase/functions/register-user/index.ts`

```typescript
// register-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // Only allow requests from known bot (verify via custom header or IP)
  const botSecret = Deno.env.get("BOT_SECRET");
  if (req.headers.get("x-bot-secret") !== botSecret) {
    return new Response("Unauthorized", { status: 403 });
  }

  const { name, email, password } = await req.json();
  
  // Create user via Auth Admin API
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  // The trigger handle_new_user() will auto-create profile + membership
  // Wait for trigger and return user_id + telegram_token
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, telegram_token")
    .eq("id", data.user.id)
    .single();

  return new Response(JSON.stringify({
    user_id: data.user.id,
    telegram_token: profile?.telegram_token,
    email: data.user.email,
  }), { headers: { "Content-Type": "application/json" } });
});
```

**Auth:** Pakai `x-bot-secret` header (shared secret antara bot dan Edge Function). Service_role key cuma ada di Edge Function.

---

### Task 5: Edge Function — `create-invoice`

**Objective:** Ganti Mayar API langsung (butuh Mayar API key) dengan Edge Function.

**Files:**
- Create: `supabase/functions/create-invoice/index.ts`

```typescript
// create-invoice/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const botSecret = Deno.env.get("BOT_SECRET");
  if (req.headers.get("x-bot-secret") !== botSecret) {
    return new Response("Unauthorized", { status: 403 });
  }

  const { name, amount, email } = await req.json();
  
  // Call Mayar API from Edge Function (API key is here, not in bot)
  const mayarRes = await fetch("https://api.mayar.id/hl/v1/invoice/create", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("MAYAR_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, amount, customer: { email } }),
  });

  const mayarData = await mayarRes.json();
  return new Response(JSON.stringify(mayarData), {
    headers: { "Content-Type": "application/json" },
  });
});
```

---

### Task 6: Migration — Bot Role + RLS untuk Bot

**Objective:** Tambah role `bot` atau mekanisme agar bot bisa akses data tanpa service_role.

**Files:**
- Create: `supabase/migrations/20260620000003_bot_rls.sql`

```sql
-- Add bot role to user_role enum (if not exists)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'bot';

-- Create a service account for the bot
-- Note: Better approach is to use JWT from logged-in user
-- Bot doesn't need its own role — it uses the user's JWT

-- RLS for admin operations (Edge Functions only)
-- These policies allow Edge Functions (running with service_role) 
-- to do admin operations, while blocking direct user access

-- Example: Allow insert to orders for authenticated users only
CREATE POLICY "orders_insert_authenticated" ON orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

**Catatan:** Bot tidak perlu role khusus. Bot akan:
1. Login sebagai user → dapat JWT user
2. Semua query pake JWT itu → RLS filter otomatis ke user_id = auth.uid()
3. Operasi admin → lewat Edge Function (service_role di Edge Function, bukan di bot)

---

## 🔥 Wave 3: Migration & Update Semua Referensi

### Task 7: SOUL.md — Update Semua Curl ke Edge Function

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/SOUL.md`

Ganti semua curl yang pake service_role key:

```bash
# SEBELUM — service_role (berbahaya)
curl -s "$SUPABASE_URL/rest/v1/orders" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"

# SESUDAH — anon key + JWT (aman, RLS filter)
curl -s "$SUPABASE_URL/rest/v1/orders?select=id,product,total,status" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"
```

Untuk admin ops (register, invoice):
```bash
# Register via Edge Function
curl -s -X POST "$SUPABASE_URL/functions/v1/register-user" \
  -H "x-bot-secret: $BOT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"...","email":"...","password":"..."}'

# Create invoice via Edge Function
curl -s -X POST "$SUPABASE_URL/functions/v1/create-invoice" \
  -H "x-bot-secret: $BOT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"...","amount":1500000,"email":"..."}'
```

---

### Task 8: Update Semua Skill

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/skills/*/SKILL.md` (9 skills)

Untuk setiap skill:
1. Hapus semua `SUPABASE_SERVICE_ROLE_KEY`
2. Ganti dengan `SUPABASE_ANON_KEY` + `$USER_JWT`
3. Update dokumentasi curl
4. Update pseudocode

---

### Task 9: Test End-to-End

**Files:**
- Run: `scripts/test-flow.sh`

Test flows:
```
1. Register user → dapat JWT
2. Query orders → cuma data sendiri
3. Query orders with different user_id → 403/empty (RLS block)
4. Coba execute command → "tool not available"
5. Coba read file → "tool not available"
6. Scrape URL → masih bisa (web tools)
```

---

### Task 10: Hapus Service Role Key dari .env

**Files:**
- Modify: `~/.hermes/profiles/mybagasi-ai/.env`

```bash
# HAPUS baris ini
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# TAMBAH baris ini
SUPABASE_ANON_KEY=eyJhbG...
BOT_SECRET=$(openssl rand -hex 32)   # shared secret dengan Edge Functions
```

---

## 🔐 Ringkasan: Sebelum vs Sesudah

| Aspek | Sebelum | Sesudah |
|-------|---------|---------|
| **Tools** | terminal, file, web, browser, memory, skills | **web, browser, clarify** — aman |
| **Akses DB** | service_role → **SEMUA DATA** | anon + JWT → **data user sendiri** |
| **Akses VPS** | terminal → **bisa baca semua file** | ❌ **Tidak bisa** |
| **Akses Hermes** | file → **baca/edit config** | ❌ **Tidak bisa** |
| **Akses user lain** | no filter | **RLS block** otomatis |
| **Admin ops (register)** | Auth Admin API langsung | **Edge Function register-user** |
| **Admin ops (invoice)** | Mayar API langsung | **Edge Function create-invoice** |
| **Scraping** | web + browser | ✅ **Tetap jalan** |

## ⚠️ Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Bot perlu JWT user — gimana dapetnya? | Saat user `/register` atau `/login`, bot simpan JWT di `memory`. Tapi memory dihapus di Task 1. **Solusi:** Simpan JWT di **database** (tabel `profiles` kolom `bot_jwt`) atau **Edge Function session store** |
| Bot perlu refresh JWT expired | JWT Supabase valid 1 jam. **Solusi:** Refresh token disimpan bareng JWT. Edge Function `refresh-session` untuk refresh otomatis |
| Bot jadi gak bisa INSERT quotation | **RLS memungkinkan INSERT dengan `auth.uid()`** — selama user login, INSERT quotation otomatis punya `user_id = auth.uid()` |
| Bot gak bisa Create Mayar invoice | **Pindah ke Edge Function** — Mayar API key aman di Edge Function |
| BOT_SECRET bocor | **Rotate via dashboard.** Ganti value, deploy ulang Edge Functions |
| Cron jobs masih pake service_role | **Cron jobs tidak perlu diubah** — cron jalan di server Hermes, bukan di chat bot. Tapi kalau mau aman total, cron juga bisa pake Edge Function |

---

## ✅ Task List

| Wave | # | Task | Priority | Files |
|------|---|------|----------|-------|
| W1 | 1 | Hapus tools berbahaya dari config.yaml | 🔴 P1 | `config.yaml` |
| W1 | 2 | Update SOUL.md persona & tools section | 🔴 P1 | `SOUL.md` |
| W1 | 3 | Hapus service_role dari semua skill & AGENTS.md | 🔴 P1 | 10+ files |
| W2 | 4 | Edge Function register-user | 🟡 P2 | `functions/register-user/` |
| W2 | 5 | Edge Function create-invoice | 🟡 P2 | `functions/create-invoice/` |
| W2 | 6 | Migration bot RLS | 🟡 P2 | Migration SQL |
| W3 | 7 | Update SOUL.md curl → Edge Function | 🟡 P2 | `SOUL.md` |
| W3 | 8 | Update semua skill (9 files) | 🟡 P2 | 9 skill files |
| W3 | 9 | Test end-to-end | 🔴 P1 | Manual |
| W3 | 10 | Hapus service_role dari .env | 🔴 P1 | `.env` |

---

## 💡 Rekomendasi Eksekusi

**Mulai dari Wave 1 — ini yang paling berdampak langsung:**

1. 🔥 **Task 1** — Config change (2 menit) → Bot langsung kehilangan akses VPS
2. 🔥 **Task 3** — Hapus service_role dari semua file (10 menit) → Bot gak bisa akses data sembarangan
3. **Task 2** — Update SOUL.md (5 menit)
4. **Task 4-5** — Edge Functions (30 menit)
5. **Task 7-8** — Update curl di SOUL.md + skills (15 menit)
6. **Task 9-10** — Test + cleanup

**⚠️ Catatan Kritis:** Task 1 (hapus tools) harus dilakukan BERSAMAAN dengan setup JWT storage. Kalau tools dihapus duluan sebelum bot punya cara dapet JWT, bot jadi "buta" — gak bisa query database sama sekali.

**Urutan aman:**
1. Task 3 (update skill curl → anon key pattern) 
2. Task 4-6 (Edge Functions)
3. Task 7-8 (update SOUL.md)
4. **Task 1** (hapus tools) — lakukan paling akhir
5. Task 9-10 (test + cleanup)
```
