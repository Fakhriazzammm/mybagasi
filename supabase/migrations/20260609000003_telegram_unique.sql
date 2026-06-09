-- ============================================================
-- Add UNIQUE constraint on profiles.telegram_id
-- Enforces 1 Telegram account ↔ 1 MyBagasi account
-- ============================================================
ALTER TABLE profiles
  ADD CONSTRAINT profiles_telegram_id_key UNIQUE (telegram_id);
