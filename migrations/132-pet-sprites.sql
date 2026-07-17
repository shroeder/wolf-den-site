-- One AI-generated battle sprite per pet (shared across all members who have that pet active). pet_id is
-- the collectible/pet id from src/lib/marketplace/collectibles.js.
CREATE TABLE IF NOT EXISTS mkt_pet_sprite (
    pet_id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
