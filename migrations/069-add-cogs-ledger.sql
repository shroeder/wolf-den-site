-- COGS / inventory-intake ledger, moved off the Google Sheet into the shared DB. We keep only the
-- data the app actually captures (date, product, quantity, paid each/total, and the optional
-- market / list-at-110 planning inputs). The sheet's FORMULA columns (margin %, pack conversions,
-- singles value, etc.) are intentionally dropped — they can be recomputed in code when we surface it.

CREATE TABLE IF NOT EXISTS cogs_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_on DATE NOT NULL,
    product TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_each NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    market_each NUMERIC(12, 2),
    market_total NUMERIC(12, 2),
    list_each_110 NUMERIC(12, 2),
    list_total_110 NUMERIC(12, 2),
    entry_id TEXT,                                    -- set for rows synced from an Inventory entry; NULL for COGS-Entry rows
    source TEXT NOT NULL DEFAULT 'app',               -- 'app' | 'sheets-import'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cogs_entry ON cogs_ledger (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cogs_date ON cogs_ledger (occurred_on DESC, created_at DESC);
