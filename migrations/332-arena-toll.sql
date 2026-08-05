-- ── STAKES AND TOLLS ─────────────────────────────────────────────────────────────────────────────────────────
-- Challenging costs gold. The challenger stakes it; win and they take the position AND their stake back plus
-- the defender's toll, lose and the defender keeps the lot.
--
-- The TOLL is the defender's own asking price — you name what it costs to come at you. It answers the question
-- a challenge ladder otherwise can't: why does the person in first place ever open the app? Their income is
-- other people's ambition.
--
-- A defender NEVER loses gold they did not stake. The challenger risks their own coin; the defender risks only
-- their position. Taking money from somebody asleep who never opted in is how you lose players.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS toll INT NOT NULL DEFAULT 250;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS purse INT NOT NULL DEFAULT 0;  -- lifetime gold taken defending
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS stake INT NOT NULL DEFAULT 0;
