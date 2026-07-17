-- Digital items / equipment system (Diablo-style). Item DEFINITIONS are hand-authored in code
-- (src/lib/marketplace/items.js) like pets/badges; the DB only tracks OWNERSHIP, what's equipped, charge
-- state, and a redemption audit log. item_id columns are the code ids (plain text, no FK).

-- Items a member owns (one instance per item def per member). Tracks charge state for charged items.
CREATE TABLE IF NOT EXISTS mkt_user_item (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id       UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id        TEXT NOT NULL,
    acquired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acquired_via   TEXT NOT NULL DEFAULT 'level',
    charges_left   INT NOT NULL DEFAULT 0,
    last_charge_at TIMESTAMPTZ,                    -- when the last charge was redeemed (drives cooldown)
    UNIQUE (buyer_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_user_item_buyer ON mkt_user_item(buyer_id);

-- What each member has equipped, by slot. ring1/ring2 hold the two ring slots.
CREATE TABLE IF NOT EXISTS mkt_user_equipment (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    slot     TEXT NOT NULL,                        -- main_hand|off_hand|helmet|chest|belt|boots|amulet|ring1|ring2
    item_id  TEXT NOT NULL,
    PRIMARY KEY (buyer_id, slot)
);

-- Audit log of charge redemptions (real-world perks handed over in-store).
CREATE TABLE IF NOT EXISTS mkt_item_redemption (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id      TEXT NOT NULL,
    reward       TEXT,
    reward_label TEXT,
    redeemed_by  TEXT NOT NULL DEFAULT 'admin',
    note         TEXT,
    redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_item_redemption_buyer ON mkt_item_redemption(buyer_id);

-- Bump the hero sprite when a member's equipped loadout changes, so the nightly sprite job redraws them
-- geared (mirrors avatar_updated_at).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS equipment_updated_at TIMESTAMPTZ;
