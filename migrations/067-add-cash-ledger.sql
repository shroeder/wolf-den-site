-- Cash on Hand ledger, moved off the Google Sheet into the shared DB. The sheet could only BLANK
-- rows (not delete), so edits left empty rows behind, hand-entered rows had no IDs and drifted, and
-- the mirror desynced. A real table fixes all of it: one row per cash movement, signed amount
-- (+ cash in / - cash out), and the balance is simply SUM(amount).

CREATE TABLE IF NOT EXISTS cash_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_on DATE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount NUMERIC(12, 2) NOT NULL,                   -- signed: + cash in, - cash out
    payment_method TEXT,
    entry_id TEXT,                                     -- links to the ledger entry (edit/upsert); NULL for float/manual rows
    source TEXT NOT NULL DEFAULT 'app',                -- 'app' | 'square' | 'manual' | 'sheets-import'
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per ledger entry: editing an entry UPSERTS (cleanly replaces) its row — no blank leftovers.
-- Partial index so the many float/manual rows (entry_id NULL) are never deduped against each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_ledger_entry ON cash_ledger (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON cash_ledger (occurred_on DESC, created_at DESC);
