-- ── A SECOND ROUND, WITHOUT DESTROYING THE FIRST ─────────────────────────────────────────────────────────────
-- mkt_survey_response was keyed on buyer_id alone, and saveResponse does ON CONFLICT (buyer_id) DO UPDATE —
-- which is exactly right for one survey ("this is an opinion, not an event log, and the current opinion is the
-- useful one") and exactly wrong for a second. Asking again would have overwritten all 34 answers in place and
-- the comparison — did the Kitchen get less hated? did the Arena land? — would be gone with them.
--
-- So a round number, and it goes in the key. Round 1 is what has already been collected; round 2 is the new
-- ask. Every existing row is stamped 1 before the constraint moves, so nothing is orphaned.
ALTER TABLE mkt_survey_response ADD COLUMN IF NOT EXISTS round SMALLINT NOT NULL DEFAULT 1;

-- Re-key on (buyer_id, round). Dropping the old primary key by its generated name is guarded, because this
-- file has to be a no-op on a database where it has already run — migrations execute under `set -e` in the
-- Vercel build and a second ALTER would take the whole deploy down.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_survey_response_pkey'
                 AND conrelid = 'mkt_survey_response'::regclass
                 AND array_length(conkey, 1) = 1) THEN
        ALTER TABLE mkt_survey_response DROP CONSTRAINT mkt_survey_response_pkey;
        ALTER TABLE mkt_survey_response ADD PRIMARY KEY (buyer_id, round);
    END IF;
END $$;

-- The tallies are always read per round now.
DROP INDEX IF EXISTS idx_survey_favorite;
DROP INDEX IF EXISTS idx_survey_least;
CREATE INDEX IF NOT EXISTS idx_survey_round_favorite ON mkt_survey_response (round, favorite);
CREATE INDEX IF NOT EXISTS idx_survey_round_least ON mkt_survey_response (round, least);
