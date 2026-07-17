-- Loot chests (account-bound, non-tradable). Earned on level-up, opened for random gear. Fungible per
-- tier, so we store a count per (buyer, tier). chest_level tracks the highest level a member has been
-- granted chests for (so we can back-fill retroactively and never double-grant).
CREATE TABLE IF NOT EXISTS mkt_user_chest (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    tier     TEXT NOT NULL,     -- wooden | iron | gold | mythic
    count    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, tier)
);
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS chest_level INT NOT NULL DEFAULT 0;
