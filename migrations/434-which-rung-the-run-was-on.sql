-- ── WHICH RUNG THE RUN WAS ON ────────────────────────────────────────────────────────────────────────────
-- The ladder (ASCENSION in cards-kit) makes the game itself harder a rung at a time, and the next rung opens
-- by WINNING on the one you are standing on. Both of those need the history to remember which rung a run was
-- climbed at: without it a win is a win and the ladder has no way to know it was earned at eight rather than
-- at nothing.
--
-- Defaulted to 0, which is the truth about every run written before the ladder existed.
ALTER TABLE mkt_cards_result ADD COLUMN IF NOT EXISTS asc_level SMALLINT NOT NULL DEFAULT 0;

-- "What is the highest rung this member has WON on" is the only question asked of it, and it is asked every
-- time the table screen opens.
CREATE INDEX IF NOT EXISTS mkt_cards_result_climb
    ON mkt_cards_result (buyer_id, asc_level DESC) WHERE outcome = 'won';
