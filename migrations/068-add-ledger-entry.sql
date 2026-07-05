-- Main ledger (income/expense/inventory/etc. entries), moved off Google Sheets into the shared DB —
-- same reason as the trade + cash ledgers: the Sheet was tied to one Google account and broke for a
-- second user, and edits/deletes were clumsy. One row per entry, keyed on the app's entry_id.
-- Timestamps kept as raw millis (BIGINT) so they round-trip to the app's EntryEntity exactly.

CREATE TABLE IF NOT EXISTS ledger_entry (
    entry_id TEXT PRIMARY KEY,
    date_ms BIGINT NOT NULL,                              -- EntryEntity.date (epoch millis)
    type TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    amount NUMERIC(12, 2) NOT NULL,
    payment_method TEXT,
    account_type TEXT,
    reimbursable BOOLEAN NOT NULL DEFAULT FALSE,
    pair_group_id TEXT,
    notes TEXT,
    receipt_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_relevant_for_cash_on_hand BOOLEAN NOT NULL DEFAULT FALSE,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    source TEXT NOT NULL DEFAULT 'app',                   -- 'app' | 'sheets-import'
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entry_date ON ledger_entry (date_ms DESC);
