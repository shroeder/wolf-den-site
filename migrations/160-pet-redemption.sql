-- Real-world pet perks (marquee elite pets): staff redeems the perk in-store from the admin app, on a
-- monthly cooldown, logged here. Mirrors the charged-item redemption model (mkt_item_redemption).
CREATE TABLE IF NOT EXISTS mkt_pet_redemption (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    pet_id       TEXT NOT NULL,
    reward_label TEXT,
    redeemed_by  TEXT,
    note         TEXT,
    redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pet_redemption_lookup ON mkt_pet_redemption (buyer_id, pet_id, redeemed_at DESC);
