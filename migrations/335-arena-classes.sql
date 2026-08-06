-- ── ARENA PROGRESSION: XP, LEVELS, CLASSES, A SKILL TREE ────────────────────────────────────────────────────
-- Arena abilities were read off the SIGNATURES ON YOUR EQUIPPED GEAR, which made the arena a readout of the
-- rest of the game rather than something you progress. Two members in the same gear had the same fight
-- forever, and the only way to change how you fight was to go and play a different feature.
--
-- Now: bouts pay arena XP → arena levels → one skill point a level. Your first level asks you to choose one
-- of three classes, and points go into that class's tree. See arena-classes.js for the catalog; the tree is
-- stored as a plain {nodeId: ranks} object so adding or retiring a node never needs a migration.
--
-- Gear still decides your ELEMENT. Affinity is a Forge decision and stays one — it is the thing the two
-- systems have in common.

ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS arena_xp    INT  NOT NULL DEFAULT 0;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS arena_class TEXT;              -- null until the first level-up
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS skill_tree  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Upgrade tracks, bought with gold, in the same shape the boat/dig/rail tracks use.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS upgrades JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Respec counters, kept for telemetry rather than pricing: the prices scale with points SPENT, so that a
-- rebuild costs what the build was worth rather than punishing somebody for experimenting twice.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS respecs       INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS class_respecs INT NOT NULL DEFAULT 0;

-- Seed arena XP from the wins already on the board, so nobody who has been fighting opens the tree at zero
-- with nothing to show for it. Deliberately modest — a nudge, not a full back-pay.
UPDATE mkt_arena SET arena_xp = LEAST(4000, COALESCE(wins, 0) * 60) WHERE arena_xp = 0 AND COALESCE(wins, 0) > 0;
