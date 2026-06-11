-- Migration: Create bills table for tracking invoices
-- Each bill = one invoice created via Mayar

CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    telegram_id TEXT,
    mayar_invoice_id TEXT,
    mayar_transaction_id TEXT,
    invoice_url TEXT,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'expired', 'cancelled', 'pending')),
    total_jpy INTEGER NOT NULL DEFAULT 0,
    total_idr INTEGER NOT NULL DEFAULT 0,
    items_summary JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_telegram_id ON bills(telegram_id);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
