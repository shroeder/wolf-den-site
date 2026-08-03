-- MINING REBUILT AROUND EXPEDITIONS.
--
-- The old shape was three chores in a row: survey a wall (deduction), spend swings (a budget), smelt (a
-- button). Each was separately metered and none of them surprised you. This replaces the lot with THREE
-- EXPEDITIONS A DAY, each one a single push-your-luck descent that ends in a seam you mine.
--
--   descend  — each push deeper is a card: ore, loot, an encounter, or the roof coming in. The deeper you
--              are the better the draw AND the likelier the collapse. Bail whenever you like.
--   mine     — the seam you walked out with. Timing no longer decides the SIZE of a known reward; it seeds
--              RARE ENTRIES INTO A POOL you draw from when the seam breaks. The haul is a surprise.
--   smelt    — its own minigame, so what comes out of the furnace is played for rather than computed.
--
-- run_json holds the descent in progress: depth, the haul so far, the best seam found, and how it ended.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS run_json JSONB;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS trips_day DATE;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS trips_used INT NOT NULL DEFAULT 0;
-- Rare tokens seeded into the draw pool by good swings on the current seam.
ALTER TABLE mkt_ore_node_hit ADD COLUMN IF NOT EXISTS pool_json JSONB;
