-- ── DAMAGE THE PACK DID NOT DEAL, AND WHY THE BAR AND THE LEADERBOARD DISAGREED ─────────────────────────
-- GrayKitsune, in the plaza: "Im confused at the boss total health .. the lost health vs total health..
-- theres no way we've done 1b damage when myself and Eric have only done 38m damage combined."
--
-- He was reading it correctly. On 2026-10-03 the live boss was scaled x10 by hand (see 458-boss-hp-bigint)
-- and BOTH hp and max_hp were multiplied together. That preserves the fraction remaining, which is the
-- right instinct — a rescale should not erase progress — but it also multiplies the damage ALREADY DEALT
-- by ten. 93,470,006 of real damage became 934,700,060 of progress, and the bar has read 841,230,054 ahead
-- of the damage ledger ever since. Two numbers on the same screen that cannot be reconciled by anyone
-- looking at them.
--
-- Nobody's progress is taken back: the pack keeps the head start, because removing it would quietly add
-- 841M to a boss members are already saying takes too long, and that is a balance decision rather than a
-- correction. What changes is that the screen can now ACCOUNT for it.
--
-- Verified against the ledger before writing it: pre-rescale damage x10 plus post-rescale damage predicts
-- the HP actually lost to within 310,140 (0.02%), which is the damage dealt in the minutes either side of
-- the cut.
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS hp_carried BIGINT NOT NULL DEFAULT 0;

-- The one live boss this happened to. Guarded on the exact figures so it cannot land on the wrong event or
-- apply twice.
UPDATE boss_event
   SET hp_carried = 841230054
 WHERE name = 'Aztheku, Void-Maw' AND max_hp = 6651370000 AND hp_carried = 0;
