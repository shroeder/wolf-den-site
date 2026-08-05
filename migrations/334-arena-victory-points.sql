-- ── VICTORY POINTS REPLACE THE POSITIONAL LADDER ────────────────────────────────────────────────────────────
-- The ladder was a list of rungs you SWAPPED places on: beat somebody above you and you took their spot. Two
-- things were wrong with that, and the second is fatal.
--
--   1. At the top there is nothing to do. First place has nobody above it, so the best player in the Den
--      opened the arena and was told "Nobody above you within reach. You are at the top of the Den."
--   2. You could not fight DOWN either, because winning swaps positions — so beating somebody below you would
--      have dragged you down to their rung as a reward for winning.
--
-- Victory Points fix both at once. Rank is your accrued total, points come from beating people, and harder
-- opponents pay more. Nothing is ever taken off you for losing, so any fight is worth having and you can
-- challenge ANYONE — above, below, or an NPC out of the Gauntlet.
--
-- It also deletes a lot of fragile machinery. `position` carried a UNIQUE index, so a swap had to park the
-- challenger on the NEGATIVE of their own rung first to avoid violating it mid-statement; the first cut of
-- that wrapped both writes in .catch(() => {}) and failed in total silence. Ordering by a plain integer needs
-- none of it. The column stays for now so nothing that still reads it breaks, but it is no longer authoritative.

ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS vp       INT NOT NULL DEFAULT 0;   -- lifetime, never spent
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS best_vp  INT NOT NULL DEFAULT 0;

-- LAURELS are the spendable half. Kept separate from VP on purpose: if rank and currency were the same number
-- then buying anything would cost you rank, and you would be punished for using the shop.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS laurels        INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS laurels_earned INT NOT NULL DEFAULT 0;

-- THE GAUNTLET — the highest NPC tier this member has beaten. Tiers are endless (a formula, not a list), so
-- this is just a high-water mark.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS npc_best INT NOT NULL DEFAULT 0;

-- Bouts record what they paid, so the economy can be audited and a recap rebuilt.
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS vp      INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS laurels INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS feats   JSONB;
-- An NPC has no row in mkt_buyer, so the defender FK cannot hold for a Gauntlet bout.
ALTER TABLE mkt_arena_bout ALTER COLUMN defender_id DROP NOT NULL;
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS npc_tier INT;

CREATE INDEX IF NOT EXISTS idx_arena_vp ON mkt_arena (vp DESC);

-- Seed VP from the standing everyone already holds, so the leaderboard does not open completely flat and the
-- ordering people can currently see is roughly preserved on day one. Top of an 84-rung ladder gets the most.
UPDATE mkt_arena a
   SET vp = GREATEST(0, (SELECT COUNT(*) FROM mkt_arena x WHERE x.position IS NOT NULL) - COALESCE(a.position, 0)) * 25,
       best_vp = GREATEST(0, (SELECT COUNT(*) FROM mkt_arena x WHERE x.position IS NOT NULL) - COALESCE(a.position, 0)) * 25
 WHERE a.position IS NOT NULL AND a.vp = 0;
