-- "Get offers from local vendors" — the seller side of the marketplace. When Luke passes on a walk-in
-- seller's card, he shows a QR to a page where the seller posts what they have; it notifies vendors,
-- who reach out to make offers. Turns a "no" into a lead that stays in the ecosystem.

CREATE TABLE IF NOT EXISTS sell_offer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    items TEXT NOT NULL,                   -- what they want to sell (free text; catalog picker later)
    asking_price TEXT,                     -- free text: a number, "open to offers", etc.
    status TEXT NOT NULL DEFAULT 'open',   -- open | closed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sell_offer_open ON sell_offer (status, created_at DESC);
