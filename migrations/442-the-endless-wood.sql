-- ── THE FOREST BECOMES A PLACE YOU WALK ─────────────────────────────────────────────────────────────
-- The stand was six patches in a JSON array and the screen was a camera sliding between them. Luke wants
-- the thing Town is: a world you walk through, with trees you come across. So the wood is GENERATED from
-- a seed (see forest-world.js) rather than stored -- every tree and mushroom in it is a pure function of
-- (seed, node index), which is what makes it endless and what lets the server check a claim about node
-- 1423 without ever having written node 1423 down.
--
-- What DOES have to be stored is the three things a seed cannot know: which seed is yours, how far you
-- have walked, and what you have picked up.
ALTER TABLE mkt_forest ADD COLUMN IF NOT EXISTS seed          bigint;
ALTER TABLE mkt_forest ADD COLUMN IF NOT EXISTS at_node       integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_forest ADD COLUMN IF NOT EXISTS deepest_node  integer NOT NULL DEFAULT 0;

-- ⚠️ FELLED NODES ARE PRUNED, NOT KEPT. An endless wood would otherwise grow an endless list of stumps.
-- A node only needs remembering while it is still regrowing; once it is back, forgetting it restores the
-- tree the seed says is there. `{ "<node>": <felledAtMs> }`.
ALTER TABLE mkt_forest ADD COLUMN IF NOT EXISTS cut           jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Same for gathered mushrooms, which do not come back at all -- so this one only holds what is in front of
-- the player, pruned behind them.
ALTER TABLE mkt_forest ADD COLUMN IF NOT EXISTS taken         jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── THE POUCH ───────────────────────────────────────────────────────────────────────────────────────
-- Leaves, mushrooms, resin and the rest. A row per material rather than a JSON blob on the forest row,
-- because alchemy is coming and "who in the Den has a Moon Sap" is a question somebody will ask -- and a
-- jsonb -> int cast across every member is a bad way to answer it. Same reasoning as the axe tracks.
CREATE TABLE IF NOT EXISTS mkt_forest_material (
    buyer_id    UUID NOT NULL,
    material_id TEXT NOT NULL,
    count       BIGINT NOT NULL DEFAULT 0,
    first_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_forest_material_buyer ON mkt_forest_material (buyer_id);
