-- Equipped avatar cosmetics: one id per slot (aura/headwear/effect/pet), unlocked on the reward track
-- and layered onto the base avatar. NULL/empty = none. Validated against the catalog in
-- src/lib/marketplace/avatar-cosmetics.js on equip.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS avatar_cosmetics JSONB;
