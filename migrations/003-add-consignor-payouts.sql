-- Track manual consignor payouts and store branded receipt snapshots
CREATE TABLE IF NOT EXISTS consignor_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method TEXT,
    note TEXT,
    receipt_number TEXT NOT NULL UNIQUE,
    receipt_html TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consignor_payouts_consignor_id ON consignor_payouts(consignor_id);
CREATE INDEX IF NOT EXISTS idx_consignor_payouts_paid_at ON consignor_payouts(paid_at DESC);
