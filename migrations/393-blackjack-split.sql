-- ── ROOM FOR A SECOND HAND ───────────────────────────────────────────────────────────────────────────────────
-- The table stored ONE hand: a `player` array and a `doubled` flag. Splitting forks that into two hands played
-- in order, each with its own cards, its own double, and its own outcome — so the shape has to change rather
-- than grow a `player2` beside it. Two columns that mean "the same thing but the other one" is how a table
-- ends up with a third.
--
-- `hands` is the whole of it: an array of { cards, doubled, fromSplit, splitAces }, and after settlement each
-- entry also carries its own outcome/won/rake. `active` is which one the player is on.
--
-- ── WHY THE BACKFILL IS WRAPPED IN A GUARD ───────────────────────────────────────────────────────────────────
-- Because this migration ALREADY RAN ONCE before the deploy ever saw it. It was executed straight against
-- production as a dry-run — which is the house rule for migrations, since they cannot be verified locally —
-- and executing it IS applying it. The runner then found it "pending" (the dry-run wrote no row into
-- pgmigrations), ran it again, and the backfill below referenced `player`, which the first run had dropped.
-- The build died on `column "player" does not exist` with the database already in its correct final state.
--
-- So: a migration that gets dry-run against production must survive being run TWICE, and the second run has
-- to be a no-op. Every statement here is now safe to repeat.
ALTER TABLE mkt_casino_hand ADD COLUMN IF NOT EXISTS hands JSONB;
ALTER TABLE mkt_casino_hand ADD COLUMN IF NOT EXISTS active SMALLINT NOT NULL DEFAULT 0;

-- Every pre-split row becomes a one-hand array. Only attempted while the old column is still there; on a
-- second run there is nothing to convert and nothing to read.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'mkt_casino_hand' AND column_name = 'player'
    ) THEN
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
    END IF;
END $$;

-- Harmless to repeat: SET NOT NULL on a column that is already NOT NULL does nothing.
ALTER TABLE mkt_casino_hand ALTER COLUMN hands SET NOT NULL;

-- The old columns go. Leaving them is worse than either keeping or removing them: a `player` column that no
-- code reads is a column the next person will read.
ALTER TABLE mkt_casino_hand DROP COLUMN IF EXISTS player;
ALTER TABLE mkt_casino_hand DROP COLUMN IF EXISTS doubled;
