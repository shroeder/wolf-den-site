-- ── THE GROVE'S OWN ECONOMY: CHESTS, MERITS AND A CRAFTING LEVEL ────────────────────────────────────────────
-- Luke: "the boss table has a loot table its got good shot like random chests and stuff, the chests are a
-- parallel chest that have rare crafting goods for the grove. And you can make boss armor that is a set in
-- game. Depending on the boss difficulty determines the rarity of the set. Also, as you craft gear you gain
-- levels in crafting each crafting level helps your rolls on crafting improving quality of the in game things
-- you craft."
--
-- ⚠️ "PARALLEL" IS THE LOAD-BEARING WORD AND IT IS WHY THIS IS A NEW TABLE. The game already has a chest
-- line -- mkt_chest, eight tiers, opened through chests.js -- and that one pays gear, gold and coins into the
-- main economy. Granting Grove chests through addChests would put rare crafting parts into the same chain
-- that pays Arena gear, where the roll is a CHAIN whose first match wins and raising any one tier silently
-- steals from the tiers below it. See [[chest-rolls-are-a-chain]]. A Grove chest pays Grove parts and
-- nothing else, so it gets its own table, its own tiers and its own roll.
--
-- All four of these hang off a player, and the Grove already owns mkt_grove_player, so three of them are
-- columns on it rather than tables of their own.

-- ── MERITS AND THE CRAFTING LEVEL ───────────────────────────────────────────────────────────────────────────
-- ⚠️ craft_xp IS STORED AND THE LEVEL IS NOT. A stored level is a number that has to be migrated the first
-- time the curve moves, and the curve will move -- the same rule the tool tiers already follow
-- (TOOL_PCT_PER_TIER reads from the tier, never from a stored bonus).
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS merits     int NOT NULL DEFAULT 0;
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS craft_xp   bigint NOT NULL DEFAULT 0;

-- ── THE GROVE'S CHESTS ──────────────────────────────────────────────────────────────────────────────────────
-- One row per tier held. Quantities rather than instances: a chest has no identity, only a tier.
CREATE TABLE IF NOT EXISTS mkt_grove_chest (
    buyer_id    uuid        NOT NULL,
    tier        text        NOT NULL,
    qty         int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT NOW(),
    updated_at  timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, tier)
);

-- ── WHAT A CRAFTED TOOL ACTUALLY CAME OUT LIKE ──────────────────────────────────────────────────────────────
-- ⚠️ QUALITY IS STORED, THE BONUS IT IMPLIES IS NOT. Quality is the ROLL -- an outcome, a fact about history
-- that no curve change can invalidate. What that roll is worth is computed at read time from the tier and the
-- quality together, so retuning the ladder never needs a backfill. Storing "this rod gives 4.2%" would.
--
-- Nullable because every tool crafted before this migration has no roll, and a row that pretends otherwise
-- would be inventing history. toolBonusPct treats null as the floor.
ALTER TABLE mkt_grove_tool ADD COLUMN IF NOT EXISTS quality int;

-- A ledger for the crafting level, so "why am I level 4" is answerable and a bad award is findable.
-- ⚠️ NOT a running total on the player row alone: a counter with no rows behind it cannot be audited, and
-- this one feeds an upgrade curve that people will argue about.
CREATE TABLE IF NOT EXISTS mkt_grove_craft_log (
    id          bigserial   PRIMARY KEY,
    buyer_id    uuid        NOT NULL,
    recipe_id   text        NOT NULL,
    kind        text        NOT NULL,
    xp          int         NOT NULL DEFAULT 0,
    quality     int,
    created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grove_craft_log_buyer ON mkt_grove_craft_log (buyer_id, created_at DESC);
