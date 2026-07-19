-- Consumables: one-shot boosts (potions, scrolls, magic stones) bought with gold and used from your stash.
-- Ownership counts + a lightweight active-boost ledger the boss fight reads for temporary buffs.
CREATE TABLE IF NOT EXISTS mkt_user_consumable (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    consumable_id TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, consumable_id)
);

-- Active temporary boosts from used consumables. kind='damage' → magnitude is a damage multiplier;
-- kind='strikes' → magnitude is extra boss attacks (expires at end of the day). Rows are read while active
-- (expires_at > now) and swept lazily.
CREATE TABLE IF NOT EXISTS mkt_user_boost (
    id BIGSERIAL PRIMARY KEY,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    magnitude NUMERIC NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_user_boost_active ON mkt_user_boost (buyer_id, kind, expires_at);
