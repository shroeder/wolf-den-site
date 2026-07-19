-- Pet trading (share-a-copy-lock-both). A pet can be traded ONCE: the recipient gets a copy, and after they
-- accept, BOTH the giver's pet and the recipient's copy become permanently non-tradeable. `tradeable` on the
-- unlock ledger tracks this (level pets get an explicit row materialized when first traded).
ALTER TABLE mkt_cosmetic_unlock ADD COLUMN IF NOT EXISTS tradeable BOOLEAN NOT NULL DEFAULT TRUE;

-- Pending/decided pet gifts. Giver offers a copy; recipient accepts (grant + lock both) or declines.
CREATE TABLE IF NOT EXISTS mkt_pet_share (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id        TEXT NOT NULL,
    from_buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    to_buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending',   -- pending / accepted / declined / cancelled
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pet_share_to ON mkt_pet_share (to_buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_pet_share_from ON mkt_pet_share (from_buyer_id, status);

-- Auto pet-collector badges (granted by syncEarnedBadges via the 'pets_owned' rule).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('pet_tamer',    'Pet Tamer',    'Collected 10 pets', '🐾', '#7fe0ff', FALSE, 'pets_owned', 10, 64),
    ('pet_keeper',   'Pet Keeper',   'Collected 25 pets', '🐕', '#4aa3ff', FALSE, 'pets_owned', 25, 65),
    ('pet_whisperer','Pet Whisperer','Collected 50 pets', '🦄', '#b76bff', FALSE, 'pets_owned', 50, 66)
ON CONFLICT (slug) DO NOTHING;
