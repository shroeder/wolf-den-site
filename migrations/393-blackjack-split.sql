-- ── ROOM FOR A SECOND HAND ───────────────────────────────────────────────────────────────────────────────────
-- The table stored ONE hand: a `player` array and a `doubled` flag. Splitting forks that into two hands played
-- in order, each with its own cards, its own double, and its own outcome — so the shape has to change rather
-- than grow a `player2` beside it. Two columns that mean "the same thing but the other one" is how a table
-- ends up with a third.
--
-- `hands` is the whole of it: an array of { cards, doubled, fromSplit, splitAces }, and after settlement each
-- entry also carries its own outcome/won/rake. `active` is which one the player is on.
--
-- The old columns are backfilled and then DROPPED in the same migration, because leaving them is worse than
-- either keeping or removing them: a `player` column that no code reads is a column the next person will read.
ALTER TABLE mkt_casino_hand ADD COLUMN IF NOT EXISTS hands JSONB;
ALTER TABLE mkt_casino_hand ADD COLUMN IF NOT EXISTS active SMALLINT NOT NULL DEFAULT 0;

-- Every existing row becomes a one-hand array. Written so it is safe to run against rows that have already
-- been converted (hands IS NULL is the guard), because a migration is spent after one run and the one run
-- has to be the right one.
UPDATE mkt_casino_hand
   SET hands = jsonb_build_array(jsonb_build_object(
           'cards', player,
           'doubled', COALESCE(doubled, FALSE),
           'fromSplit', FALSE,
           'splitAces', FALSE,
           'outcome', outcome,
           'won', COALESCE(won, 0),
           'rake', COALESCE(rake, 0)))
 WHERE hands IS NULL;

ALTER TABLE mkt_casino_hand ALTER COLUMN hands SET NOT NULL;
ALTER TABLE mkt_casino_hand DROP COLUMN IF EXISTS player;
ALTER TABLE mkt_casino_hand DROP COLUMN IF EXISTS doubled;
