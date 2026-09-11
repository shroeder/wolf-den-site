-- ── THE SERVER PLAYS THE FIGHT (2026-09-11) ──────────────────────────────────────────────────────────────
-- Migration 443 added `unverified` for a SHADOW VERIFIER: the browser played the fight, said "I won this room
-- at 34 health", and the server replayed the move log to see whether it agreed. That was the wrong shape and
-- it lasted about an hour. The rules lived in two places, the server's copy only ever ran in judgement, and a
-- disagreement between them was a support ticket rather than an impossibility -- a browser could still ASSERT
-- an ending and everything after that was the server arguing with it.
--
-- There is no "I won" to send any more. The server deals the fight when the room is entered, holds it, and is
-- the only thing that ever applies a move to it. A browser sends what the player DID -- plays, drinks, end of
-- turn -- and gets back the fight as it now is. An outcome is something the server NOTICES.
--
-- So the column changes meaning, and therefore its name. What is worth counting now is a move the server
-- REFUSED: an honest run is zero for ever, because the screen runs the same engine and cannot offer an
-- illegal move. Anything else is a bug or somebody at the API by hand.
--
-- ⚠️ GUARDED, BECAUSE A RENAME IS NOT IF-NOT-EXISTS. Every migration in this repo has to survive being run
-- against a database where it has already happened -- local dev shares the production database, so anything
-- applied by hand to look at it is applied BEFORE the deploy gets there, and the deploy still runs the file.
-- The first cut of this was a bare ALTER ... RENAME and it failed the deploy exactly that way: the column it
-- renamed was already gone, by my own hand, twenty minutes earlier.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'mkt_cards_result' AND column_name = 'unverified') THEN
        ALTER TABLE mkt_cards_result RENAME COLUMN unverified TO refused;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'mkt_cards_result' AND column_name = 'unverified_why') THEN
        ALTER TABLE mkt_cards_result RENAME COLUMN unverified_why TO refused_why;
    END IF;
END $$;

-- And if neither column ever existed (a database built after 443 but before this), make them outright.
ALTER TABLE mkt_cards_result ADD COLUMN IF NOT EXISTS refused SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE mkt_cards_result ADD COLUMN IF NOT EXISTS refused_why TEXT;

DROP INDEX IF EXISTS mkt_cards_result_unverified;
CREATE INDEX IF NOT EXISTS mkt_cards_result_refused
    ON mkt_cards_result (buyer_id, ended_at DESC) WHERE refused > 0;
