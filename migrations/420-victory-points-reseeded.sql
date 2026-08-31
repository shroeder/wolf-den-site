-- ── THE LADDER IS RESEEDED (2026-08-31) ──────────────────────────────────────────────────────────────────────
-- Victory points became a rating today: they transfer between members, zero-sum, and nothing mints them any
-- more. The balances they inherited were built by the OLD rule, which only ever added — so they measured how
-- much somebody had played rather than how well, and the ladder said so out loud:
--
--     GrayKitsune       23,650   267W / 406L   40%   <- number one, with a losing record
--     Eric D            23,548   322W / 306L   51%
--     JT                23,508   294W / 377L   44%
--     SoullessShiitake  18,794   212W /  86L   71%   <- best record in the Den, fourth
--
-- The three at the top were the three who had fought the most bouts, not the three who won them.
--
-- IT ALSO BROKE THE MATHS. VP_SCALE is 3,000 and the board ran 0 to 23,650 — nearly eight scale units. Any
-- match across that is so lopsided the transfer pins at its extremes (300 if the underdog wins, 1 if they do
-- not), so Elo could not tell a close fight from a hopeless one anywhere on the board.
--
-- SEEDED, NOT FLATTENED. Everyone lands near 1,200, tilted by WIN RATE rather than volume, and the tilt is
-- confidence-weighted: a three-bout record barely moves you off centre and a twenty-bout one counts in full.
-- That is the same rule the rest of the Den follows — never rank a percentage without a sample behind it.
-- The 70 members who have never fought start dead centre, which is what "no evidence either way" means.
--
-- The resulting spread is about 970 to 1,510 — well inside one scale unit, which is where Elo can actually
-- separate people. It widens on its own from here: twelve bouts a day at roughly 150 a bout means a member
-- who keeps winning is clear of the pack within a week, and that spread will have been EARNED under the new
-- rule rather than inherited from the old one.
--
-- best_vp moves with it. Leaving a lifetime peak of 23,650 above a current 1,117 would be a record in a unit
-- that no longer exists.
UPDATE mkt_arena
   SET vp = GREATEST(0, ROUND(
           1200 + (
               (CASE WHEN (COALESCE(wins,0) + COALESCE(losses,0)) > 0
                     THEN COALESCE(wins,0)::numeric / (COALESCE(wins,0) + COALESCE(losses,0))
                     ELSE 0.5 END) - 0.5
           ) * 800 * LEAST(1, (COALESCE(wins,0) + COALESCE(losses,0))::numeric / 20)
       )),
       best_vp = GREATEST(0, ROUND(
           1200 + (
               (CASE WHEN (COALESCE(wins,0) + COALESCE(losses,0)) > 0
                     THEN COALESCE(wins,0)::numeric / (COALESCE(wins,0) + COALESCE(losses,0))
                     ELSE 0.5 END) - 0.5
           ) * 800 * LEAST(1, (COALESCE(wins,0) + COALESCE(losses,0))::numeric / 20)
       )),
       updated_at = NOW();
