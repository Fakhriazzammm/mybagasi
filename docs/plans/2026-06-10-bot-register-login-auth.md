# MyBagasi Bot — Register & Login via Telegram

> **Untuk Hermes:** Implementasi task-by-task via subagent. Baca SOUL.md + TOOLS.md + PROJECT.md sebelum mulai.

**Goal:** User bisa mendaftar akun MyBagasi baru atau login ke akun existing langsung dari Telegram bot, tanpa harus buka website.

**Architecture:**
- Bot menggunakan Supabase Auth Admin API (`POST /auth/v1/admin/users`) dengan **service_role_key** untuk membuat user baru (auto-confirm karena `enable_confirmations = false`)
- Trigger `handle_new_user()` di DB otomatis buat profile + `telegram_token`
- Dua mode: **Register** (user baru) dan **Login** (user existing yang belum link Telegram)
- Flow 2-step: registrasi dulu → bot kasih kode rahasia → user ketik kode untuk verifikasi → bot aktif

**Tech Stack:** Python asyncio, httpx, Supabase Auth Admin API, Supabase REST API

---

## 🔍 Analisis & Konteks

### Tables

**`profiles`** (public):
- `id UUID PK → auth.users(id)`
- `name TEXT`, `email TEXT`, `role user_role DEFAULT 'customer'`
- `telegram_token TEXT UNIQUE` — auto-generated via trigger `generate_telegram_token()` on INSERT
- `telegram_id BIGINT UNIQUE` — diisi saat user link Telegram
- `status user_status DEFAULT 'active'`

**Triggers:**
- `handle_new_user()` — AFTER INSERT on `auth.users` → INSERT into `profiles` + `user_memberships`
- `generate_telegram_token()` — BEFORE INSERT on `profiles` → set `telegram_token` jika NULL

### Endpoints

**Supabase Auth Admin API** (service_role only):
- `POST {SUPABASE_URL}/auth/v1/admin/users` — create user (auto-confirm, bypass email verification)

**Supabase REST API** (service_role only):
- `GET /rest/v1/profiles?telegram_token=eq.{token}` — lookup by token
- `PATCH /rest/v1/profiles?id=eq.{id}` — update telegram_id
- `GET /rest/v1/profiles?email=eq.{email}` — lookup by email (for login)

### State Variables (baru — perlu ditambah di bot)
- `_pending_reg: dict[int, dict]` — `{chat_id: {"step": "name"|"email"|"password", "name": "...", "email": "..."}}`
- `_pending_login: dict[int, dict]` — `{chat_id: {"step": "email"|"verify", "email": "...", "new_token": "...", "user_id": "..."}}`

---

## 📋 Task

### Task 1: Migration — Profile Lookup by Email

**Objective:** Bot perlu lookup user by email untuk fitur login, tapi `email` di `profiles` gak ada index.

**Files:**
- Create: `supabase/migrations/20260610000001_bot_auth_index.sql`

**Isi file:**
```sql
-- Index for fast lookup by email (used by bot /login)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Function: generate new telegram_token for existing user
CREATE OR REPLACE FUNCTION rotate_telegram_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  UPDATE profiles
  SET telegram_token = v_token, updated_at = NOW()
  WHERE id = p_user_id;
  RETURN v_token;
END;
$$;
```

**Verifikasi:** Run migration di Supabase SQL Editor.

---

### Task 2: Bot — Registration State + Admin API Call

**Objective:** Tambah multi-step registration flow di bot.

**Files:**
- Modify: `scraper/telegram_bot.py` (lines 58-61 — tambah state dict)
- Modify: `scraper/telegram_bot.py` (after line 166 — tambah fungsi baru)

**Step 1: Tambah state dict**

Di area `# ── Conversation State` (line 58-61), tambah:
```python
# Registration & login pending states
_pending_reg: dict[int, dict[str, Any]] = {}    # {chat_id: {"step": "name"|"email"|"password", "name": ..., "email": ...}}
_pending_login: dict[int, dict[str, Any]] = {}   # {chat_id: {"step": "email"|"verify", "email": ..., "new_token": ..., "user_id": ...}}
```

**Step 2: Tambah fungsi register_user_via_admin_api**

Setelah fungsi `lookup_user_by_telegram_id` (line 166), tambah fungsi baru:

```python
async def register_user_via_admin_api(name: str, email: str, password: str) -> dict:
    """Create a new user via Supabase Auth Admin API (service_role).
    The trigger handle_new_user() will auto-create profile + telegram_token.
    Returns the user_id on success."""
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
    }
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"name": name},
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code in (200, 201):
                data = r.json()
                return {"success": True, "user_id": data["id"], "email": data.get("email", email)}
            err = r.json().get("msg") or r.text[:200]
            return {"error": err}
    except Exception as e:
        log.error(f"register_user error: {e}")
        return {"error": str(e)}
```

**Step 3: Tambah fungsi get_profile_by_email**

```python
async def get_profile_by_email(email: str) -> dict | None:
    """Lookup profile by email address."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"email": f"eq.{email.lower()}", "select": "id,name,email,telegram_id,telegram_token,role", "limit": 1},
                headers=headers,
            )
            if r.status_code == 200 and r.json():
                return r.json()[0]
            return None
    except Exception as e:
        log.error(f"get_profile_by_email error: {e}")
        return None
```

**Step 4: Tambah fungsi rotate_token**

```python
async def rotate_telegram_token(user_id: str) -> str | None:
    """Generate a new telegram_token for a user via DB function."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/rotate_telegram_token",
                json={"p_user_id": user_id},
                headers=headers,
            )
            if r.status_code == 200:
                return r.text.strip().strip('"')
            return None
    except Exception as e:
        log.error(f"rotate_token error: {e}")
        return None
```

---

### Task 3: Bot — Handler: `/register`

**Objective:** Multi-step registration flow.

**Files:**
- Modify: `scraper/telegram_bot.py` (tambah handler setelah `handle_wishlist` sekitar line 887)

**Kode handler:**

```python
async def handle_register(chat_id: int):
    """Start multi-step registration flow."""
    # Cek dulu apakah sudah ter-link
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Gunakan `/unlink` dulu untuk ganti akun.")
        return
    
    # Bersihkan pending state lain
    _pending_reg.pop(chat_id, None)
    _pending_login.pop(chat_id, None)
    
    _pending_reg[chat_id] = {"step": "name"}
    await tg_send(chat_id,
        "👋 *Daftar MyBagasi* — Langkah 1/3\n\n"
        "Masukkan *Nama Lengkap* kamu:")
```

```python
async def handle_login(chat_id: int):
    """Start login flow for existing users."""
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id,
            f"⚠️ Akun Telegram ini sudah terhubung ke *{existing['name']}*.\n"
            f"Gunakan `/unlink` dulu untuk ganti akun.")
        return
    
    _pending_reg.pop(chat_id, None)
    _pending_login.pop(chat_id, None)
    
    _pending_login[chat_id] = {"step": "email"}
    await tg_send(chat_id,
        "🔐 *Login MyBagasi*\n\n"
        "Masukkan *Email* yang terdaftar:")
```

---

### Task 4: Bot — Step Processor (Registration)

**Objective:** Process each step of the registration flow — called from `process_update` when user is in pending state.

**Files:**
- Modify: `scraper/telegram_bot.py` (tambah fungsi baru setelah handler-register, sebelum `process_update`)

```python
async def process_reg_step(chat_id: int, text: str):
    """Process registration step by step."""
    state = _pending_reg.get(chat_id)
    if not state:
        return False
    
    step = state["step"]
    
    if step == "name":
        name = text.strip()
        if len(name) < 2:
            await tg_send(chat_id, "❌ Nama minimal 2 karakter. Coba lagi:")
            return True
        state["name"] = name
        state["step"] = "email"
        await tg_send(chat_id,
            "✉️ *Langkah 2/3* — Masukkan *Email* kamu:\n\n"
            "Email akan digunakan untuk login di mybagasi.my.id.")
        return True
    
    elif step == "email":
        email = text.strip().lower()
        if "@" not in email or "." not in email:
            await tg_send(chat_id, "❌ Email tidak valid. Coba lagi:")
            return True
        state["email"] = email
        state["step"] = "password"
        await tg_send(chat_id,
            "🔑 *Langkah 3/3* — Buat *Password* (minimal 6 karakter):")
        return True
    
    elif step == "password":
        password = text.strip()
        if len(password) < 6:
            await tg_send(chat_id, "❌ Password minimal 6 karakter. Coba lagi:")
            return True
        
        await tg_send(chat_id, "⏳ Membuat akun MyBagasi...")
        
        # Create user via Admin API
        result = await register_user_via_admin_api(state["name"], state["email"], password)
        
        # Clear password from memory
        password = ""
        state.pop("password", None)
        
        if "error" in result:
            error_msg = result["error"]
            if "already registered" in error_msg.lower() or "already exists" in error_msg.lower() or "duplicate" in error_msg.lower():
                await tg_send(chat_id,
                    f"❌ Email `{state['email']}` sudah terdaftar.\n\n"
                    f"Gunakan `/login` untuk masuk ke akun yang sudah ada.")
            else:
                await tg_send(chat_id, f"❌ Gagal daftar: {error_msg[:100]}")
            _pending_reg.pop(chat_id, None)
            return True
        
        user_id = result["user_id"]
        
        # Baca profile yang auto-created oleh trigger (dapatkan telegram_token)
        profile = None
        for attempt in range(5):
            profile = await lookup_user_by_telegram_id(chat_id)
            # Ini gak akan work karena telegram_id belum di-link
            # Alternatif: baca profile via user_id
            headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.get(
                        f"{SUPABASE_URL}/rest/v1/profiles",
                        params={"id": f"eq.{user_id}", "select": "id,name,email,telegram_token,telegram_token", "limit": 1},
                        headers=headers,
                    )
                    if r.status_code == 200 and r.json():
                        profile = r.json()[0]
                        break
            except:
                pass
            await asyncio.sleep(0.5)
        
        if not profile:
            await tg_send(chat_id, "❌ Akun dibuat tapi gagal membaca profile. Coba login dengan `/login`.")
            _pending_reg.pop(chat_id, None)
            return True
        
        token = profile["telegram_token"]
        
        # Kirim kode rahasia + link profile
        await tg_send(chat_id,
            f"✅ *Akun MyBagasi berhasil dibuat!*\n\n"
            f"Halo *{state['name']}*! 🎉\n\n"
            f"*Kode Rahasia kamu:*\n"
            f"`{token}`\n\n"
            f"📋 *Simpan kode ini* — kamu bisa pakai untuk:\n"
            f"• Menghubungkan Telegram lain\n"
            f"• Verifikasi ulang akun\n\n"
            f"🔗 Kunjungi profilmu: mybagasi.my.id/profile\n\n"
            f"📌 *Sekarang ketik kode di atas* untuk verifikasi dan mulai belanja!")
        
        # Simpan state untuk verifikasi token
        _pending_reg[chat_id] = {"step": "verify", "user_id": user_id, "token": token, "name": state["name"]}
        return True
    
    elif step == "verify":
        # Verifikasi token — user mengetik kode yang baru diberikan
        input_token = text.strip().upper()
        expected_token = state.get("token", "")
        
        if input_token == expected_token:
            # Link telegram_id
            success = await link_telegram(state["user_id"], chat_id)
            if success:
                conversations[chat_id] = {"messages": [], "context": {"user_id": state["user_id"]}}
                await tg_send(chat_id,
                    f"✅ *Verifikasi Berhasil!*\n\n"
                    f"Halo *{state['name']}*! Selamat berbelanja! 🎉\n\n"
                    f"*Yang bisa kamu lakukan:*\n"
                    f"🔍 Kirim *kata kunci* — cari produk Jepang\n"
                    f"🔗 Kirim *link marketplace* — cek harga\n"
                    f"💳 Bayar via chat — checkout langsung\n"
                    f"📋 `/wishlist` — lihat wishlist\n"
                    f"📊 Dashboard: mybagasi.my.id/dashboard\n\n"
                    f"💡 Contoh: ketik `/beli onitsuka tiger`")
                log.info(f"User registered via bot: {state['name']} ({state['user_id'][:8]})")
            else:
                await tg_send(chat_id, "❌ Gagal menghubungkan. Coba `/start` dengan kode rahasia.")
        else:
            await tg_send(chat_id,
                f"❌ Kode salah. Coba lagi.\n\n"
                f"Kode rahasia kamu: `{expected_token}`")
        
        _pending_reg.pop(chat_id, None)
        return True
    
    return False
```

---

### Task 5: Bot — Step Processor (Login)

**Objective:** Process each step of the login flow.

**Files:**
- Modify: `scraper/telegram_bot.py` (tambah fungsi setelah `process_reg_step`)

```python
async def process_login_step(chat_id: int, text: str):
    """Process login step by step."""
    state = _pending_login.get(chat_id)
    if not state:
        return False
    
    step = state["step"]
    
    if step == "email":
        email = text.strip().lower()
        if "@" not in email:
            await tg_send(chat_id, "❌ Email tidak valid. Coba lagi:")
            return True
        
        profile = await get_profile_by_email(email)
        if not profile:
            await tg_send(chat_id,
                f"❌ Email `{email}` tidak ditemukan.\n\n"
                f"Gunakan `/register` untuk membuat akun baru.")
            _pending_login.pop(chat_id, None)
            return True
        
        if profile.get("telegram_id"):
            await tg_send(chat_id,
                f"⚠️ Akun *{profile['name']}* sudah terhubung ke Telegram lain.\n"
                f"Hubungi admin untuk bantuan.")
            _pending_login.pop(chat_id, None)
            return True
        
        # Generate new token
        new_token = await rotate_telegram_token(profile["id"])
        if not new_token:
            await tg_send(chat_id, "❌ Gagal generate kode. Coba lagi nanti.")
            _pending_login.pop(chat_id, None)
            return True
        
        state["user_id"] = profile["id"]
        state["name"] = profile["name"]
        state["new_token"] = new_token
        state["step"] = "verify"
        
        await tg_send(chat_id,
            f"🔐 *Verifikasi Login*\n\n"
            f"Halo *{profile['name']}*! 👋\n\n"
            f"*Kode verifikasi kamu:*\n"
            f"`{new_token}`\n\n"
            f"📌 Ketik kode di atas untuk mengaktifkan bot.")
        return True
    
    elif step == "verify":
        input_token = text.strip().upper()
        expected_token = state.get("new_token", "")
        
        if input_token == expected_token:
            success = await link_telegram(state["user_id"], chat_id)
            if success:
                conversations[chat_id] = {"messages": [], "context": {"user_id": state["user_id"]}}
                await tg_send(chat_id,
                    f"✅ *Login Berhasil!*\n\n"
                    f"Selamat datang kembali, *{state['name']}*! 🎉\n\n"
                    f"Lanjutkan belanja dengan kirim kata kunci atau link produk!")
                log.info(f"User logged in via bot: {state['name']} ({state['user_id'][:8]})")
            else:
                await tg_send(chat_id, "❌ Gagal menghubungkan. Coba lagi.")
        else:
            await tg_send(chat_id,
                f"❌ Kode salah. Coba lagi.\n\n"
                f"Kode verifikasi: `{expected_token}`")
        
        _pending_login.pop(chat_id, None)
        return True
    
    return False
```

---

### Task 6: Bot — Update Message Router

**Objective:** Add `/register`, `/login`, `/logout` commands + detect token input in `process_update`.

**Files:**
- Modify: `scraper/telegram_bot.py` (around line 956-991 — command routing)

**Step 1: Tambah command routing** (setelah `command == "/unlink"` block):

```python
elif command == "/register":
    await handle_register(chat_id)
elif command == "/login":
    await handle_login(chat_id)
elif command == "/logout":
    await handle_unlink(chat_id)  # Reuse unlink
```

**Step 2: Update `/help`** — tambah `/register` dan `/login` ke daftar.

**Step 3: Update fallback `else` block** (line 985-991) — cek pending state sebelum fallback:

Ubah dari:
```python
else:
    if not user_profile:
        await handle_start(chat_id, "")
        return
    is_url = bool(re.match(r'^https?://', text))
    await handle_ai(chat_id, text, user_profile)
```

Menjadi:
```python
else:
    # Cek pending registration/login steps
    if chat_id in _pending_reg:
        await process_reg_step(chat_id, text)
        return
    if chat_id in _pending_login:
        await process_login_step(chat_id, text)
        return
    
    # Jika token 12 karakter uppercase → auto-verify
    if re.match(r'^[A-Z0-9]{12}$', text.strip().upper()):
        verify_token = text.strip().upper()
        await handle_token_verification(chat_id, verify_token)
        return
    
    if not user_profile:
        await tg_send(chat_id,
            "👋 *Selamat datang di MyBagasi!*\n\n"
            "• `/register` — Daftar akun baru\n"
            "• `/login` — Login ke akun yang sudah ada\n"
            "• `/start KODE` — Hubungkan dengan kode rahasia\n\n"
            "Belum punya akun? Langsung daftar via `/register`!")
        return
    
    await handle_ai(chat_id, text, user_profile)
```

---

### Task 7: Bot — Token Verification Handler

**Objective:** Handle when user types a raw token code (12 chars uppercase).

**Files:**
- Modify: `scraper/telegram_bot.py` (tambah fungsi setelah `handle_login`)

```python
async def handle_token_verification(chat_id: int, token: str):
    """Handle when user types a raw token code for verification."""
    existing = await lookup_user_by_telegram_id(chat_id)
    if existing:
        await tg_send(chat_id, f"✅ Akun kamu (*{existing['name']}*) sudah terhubung!")
        return
    
    user = await lookup_user_by_token(token)
    if not user:
        await tg_send(chat_id,
            "❌ Kode tidak valid.\n\n"
            "• `/register` — Daftar akun baru\n"
            "• `/login` — Login dengan email\n"
            "• Cek kode di mybagasi.my.id/profile")
        return
    
    if user.get("telegram_id") and user["telegram_id"] != chat_id:
        await tg_send(chat_id,
            "❌ Kode ini sudah terhubung ke Telegram lain.\n"
            "Gunakan `/login` untuk login ulang.")
        return
    
    success = await link_telegram(user["id"], chat_id)
    if success:
        conversations[chat_id] = {"messages": [], "context": {"user_id": user["id"]}}
        await tg_send(chat_id,
            f"✅ *Verifikasi Berhasil!*\n\n"
            f"Selamat datang, *{user['name']}*! 🎉\n\n"
            f"Lanjutkan dengan mengirim kata kunci atau link produk!")
        log.info(f"User verified via token: {user['name']} ({user['id'][:8]})")
    else:
        await tg_send(chat_id, "❌ Gagal menghubungkan. Coba lagi.")
```

---

### Task 8: Bot — Reset Pending States on /reset

**Objective:** Clean up pending states when user resets.

**Files:**
- Modify: `scraper/telegram_bot.py` (line 966-968 — `/reset` handler)

Ubah:
```python
elif command == "/reset":
    reset_conversation(chat_id)
    await tg_send(chat_id, "🔄 Percakapan di-reset. Mulai lagi yuk!")
```

Menjadi:
```python
elif command == "/reset":
    reset_conversation(chat_id)
    _pending_reg.pop(chat_id, None)
    _pending_login.pop(chat_id, None)
    await tg_send(chat_id, "🔄 Percakapan di-reset. Mulai lagi yuk!")
```

---

### Task 9: Bot — Update `handle_start` untuk Menampilkan Opsi Register/Login

**Objective:** Ketika `/start` tanpa token dan user belum ter-link, tampilkan opsi register & login.

**Files:**
- Modify: `scraper/telegram_bot.py` (line 760-767 — `/start` tanpa token + belum login)

Ubah dari:
```python
            await tg_send(chat_id,
                "👋 *Selamat datang di MyBagasi Bot!*\n\n"
                "Untuk menghubungkan akun MyBagasi kamu:\n"
                "`/start KODE_RAHASIA_KAMU`\n\n"
                "Kode rahasia ada di halaman *Profile* aplikasi MyBagasi.\n"
                "https://mybagasi.my.id/profile\n\n"
                "Belum punya akun? Daftar di https://mybagasi.my.id/auth/register")
```

Menjadi:
```python
            await tg_send(chat_id,
                "👋 *Selamat datang di MyBagasi Bot!*\n\n"
                "Pilih salah satu:\n\n"
                "🆕 `/register` — Daftar akun baru (30 detik)\n"
                "🔐 `/login` — Login ke akun yang sudah ada\n\n"
                "Atau jika sudah punya kode rahasia:\n"
                "📌 `/start KODE` — Hubungkan dengan kode\n\n"
                "💡 *Baru pertama?* Langsung `/register` aja!")
```

---

## 🔄 Flow Lengkap

```
┌─ REGISTRASI ──────────────────────────────────────────────┐
│                                                             │
│  /register                                                  │
│  Bot: Nama lengkap kamu?                                    │
│  User: Fakhri Azzam                                        │
│  Bot: ✉️ Email?                                             │
│  User: fakhri@email.com                                     │
│  Bot: 🔑 Password?                                          │
│  User: ••••••••                                            │
│  Bot: ⏳ Membuat akun...                                    │
│       ↓                                                     │
│  Supabase Admin API → auth.users baru                       │
│  Trigger → profile + telegram_token auto-created            │
│       ↓                                                     │
│  Bot: ✅ Akun berhasil!                                     │
│       Kode rahasia: ABC123XYZ                               │
│       "Ketik kode untuk verifikasi"                         │
│  User: ABC123XYZ                                           │
│  Bot: ✅ Verifikasi! Selamat datang Fakhri! 🎉              │
│  → Bot AKTIF 🚀                                            │
│                                                             │
│  💡 User langsung bisa belanja tanpa buka web               │
│                                                             │
├─ LOGIN ────────────────────────────────────────────────────┤
│                                                             │
│  /login                                                     │
│  Bot: ✉️ Email?                                             │
│  User: fakhri@email.com                                     │
│  Bot: Kode verifikasi: ABC456DEF                            │
│  User: ABC456DEF                                            │
│  Bot: ✅ Selamat datang kembali, Fakhri! 🎉                 │
│  → Bot AKTIF 🚀                                            │
│                                                             │
├─ TOKEN VERIFICATION ──────────────────────────────────────┤
│                                                             │
│  User: ABC123XYZ (ketik langsung)                           │
│  Bot: ✅ Verifikasi Berhasil! Fakhri! 🎉                    │
│  (langsung link tanpa /start)                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 Keamanan

| Aspek | Mitigasi |
|-------|----------|
| Password di chat | Hanya diketik sekali, langsung diproses, `password = ""` setelahnya, tidak di-log |
| State memory | `_pending_reg` & `_pending_login` di-clear setelah selesai atau error |
| Rate limit | Tidak ada di bot level — bisa ditambah: max 3 register per chat_id per jam |
| Email duplikat | Supabase Auth tolak → bot arahkan ke `/login` |
| Token expired | Token tidak expired (tapi user selalu bisa `/login` untuk generate baru) |
| Logging | Jangan log: `log.info(f"register: {email}")` — cukup `log.info(f"register ok")` |
| Service role key | Hanya ada di server-side bot, tidak terekspos |

---

## ✅ Verifikasi

| Step | Cara Test |
|------|-----------|
| Register baru | `/register` → isi nama, email, password → cek `auth.users` + `profiles` di Supabase |
| Auto-link | Cek `profiles.telegram_id = chat_id` setelah verifikasi |
| Bot langsung aktif | Kirim "cari sepatu nike" → bot respon via AI |
| Login existing | `/login` → email → ketik kode → cek telegram_id ter-update |
| Token langsung | Ketik kode 12 char langsung → bot verifikasi |
| Error: email duplikat | Register dengan email yang sudah ada → dapat error + saran login |
| Error: token salah | Ketik kode acak → "Kode tidak valid" |
| /reset | Reset di tengah register → pending state dihapus |
| /start tanpa token | Tampilkan opsi register/login |
| Web login | Login di mybagasi.my.id dengan email+password yang sama |

---

## ⚠️ Pitfalls

1. **Supabase Auth Admin API rate limit** — Jika kena 429, bot harus kasih "Coba lagi nanti"
2. **Race condition trigger** — `handle_new_user()` mungkin belum selesai sebelum bot baca profile. Gunakan retry loop (5x, 500ms interval) seperti di kode
3. **Token uppercase** — User mungkin ketik lowercase. Selalu `.upper()` sebelum komparasi
4. **Pending state loss on restart** — Jika bot restart di tengah register, user harus mulai ulang. Ini acceptable untuk MVP
5. **User sudah link di Telegram lain** — Cek `telegram_id` sebelum proses login. Jika sudah terisi, tolak dengan "hubungi admin"
6. **Email normalization** — Selalu `.lower().strip()` sebelum digunakan
