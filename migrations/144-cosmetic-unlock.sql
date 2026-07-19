-- Cosmetics (pets/borders/frames/auras) bought early with gold. These categories are otherwise unlocked
-- purely by level; a row here means the member paid gold to unlock it now. The unlock helpers + equip
-- validators treat a purchased ref as unlocked.
CREATE TABLE IF NOT EXISTS mkt_cosmetic_unlock (
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    category    TEXT NOT NULL,   -- pet | border | frame | cosmetic
    ref         TEXT NOT NULL,   -- the catalog id
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, category, ref)
);
