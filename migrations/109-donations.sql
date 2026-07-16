-- Donations: track what customers donate to The Wolf Den, and reward them (scan-to-earn QR, like
-- trades). A donation is recorded in the admin app; the donor scans the QR to bank XP + donation badges.
CREATE TABLE IF NOT EXISTS donation (
    id TEXT PRIMARY KEY,                              -- app-generated id (idempotency key)
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,         -- donation value in dollars
    item_description TEXT,                            -- what was donated (cards, cash, product, …)
    donor_name TEXT,                                  -- optional, for the owner's records
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_donation_created ON donation (created_at DESC);

-- One scan-to-earn claim per donation (mirrors mkt_trade_claim). Per-donor stats aggregate from the
-- redeemed claims.
CREATE TABLE IF NOT EXISTS mkt_donation_claim (
    token TEXT PRIMARY KEY,
    donation_id TEXT NOT NULL REFERENCES donation(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    redeemed_buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_donation_claim_donation ON mkt_donation_claim (donation_id);
CREATE INDEX IF NOT EXISTS idx_mkt_donation_claim_redeemer ON mkt_donation_claim (redeemed_buyer_id) WHERE redeemed_buyer_id IS NOT NULL;

-- Donation badges (unlockable, driven by aggregated redeemed-claim stats).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('first_donation', 'First Donation',      'Made your first donation to The Wolf Den', '🎁', '#e0743a', FALSE, 'donation_count', 1,   160),
    ('generous_soul',  'Generous Soul',       'Donated $100 to The Wolf Den',             '💗', '#ff5fa2', FALSE, 'donation_value', 100, 161),
    ('benefactor',     'Wolf Den Benefactor', 'Donated $500 to The Wolf Den',             '🏅', '#d4af37', FALSE, 'donation_value', 500, 162)
ON CONFLICT (slug) DO NOTHING;
