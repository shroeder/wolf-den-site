-- Small key/value store for marketplace-wide settings (e.g. the shared default sprite URL).
CREATE TABLE IF NOT EXISTS mkt_setting (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
