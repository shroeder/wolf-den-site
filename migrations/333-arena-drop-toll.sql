-- ── THE TOLL IS GONE ─────────────────────────────────────────────────────────────────────────────────────────
-- 332 let a defender name what it cost to challenge them. The idea was to answer a real hole in a challenge
-- ladder: the person in first place can only ever lose, so they have nothing to gain by opening the app.
--
-- But a price you set with no exposure of your own isn't a wager, it's a toll booth. The defender staked
-- nothing and lost nothing extra on a defeat, so a high toll had no downside at all — the maximum strictly
-- dominated. Worse, it let the top of the ladder price everyone out and freeze the rungs, which is the same
-- wall that had to be taken out of the combat maths a few commits ago.
--
-- The daily podium chests already give the leader something to hold on to, so challenging is simply free now.
-- Nothing outstanding when this ran: no live bouts carried a stake and no purse was non-zero, so there is
-- nothing to refund.
ALTER TABLE mkt_arena DROP COLUMN IF EXISTS toll;
ALTER TABLE mkt_arena DROP COLUMN IF EXISTS purse;
ALTER TABLE mkt_arena_bout DROP COLUMN IF EXISTS stake;
