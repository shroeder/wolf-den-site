-- Public "sell or consign to us" intake. A customer describes what they have and how they want to
-- move it (sell outright or consign); it emails the owner and is kept here as a record. Lives on the
-- existing /sell-cards page. (Catalog-picker version is a later enhancement.)

CREATE TABLE IF NOT EXISTS sell_inquiry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL DEFAULT 'sell',   -- sell | consign
    name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    items TEXT NOT NULL,                  -- free-text description of what they want to sell/consign
    message TEXT,
    sent_at TIMESTAMPTZ,                  -- when the notify email went out
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sell_inquiry_created ON sell_inquiry (created_at DESC);
