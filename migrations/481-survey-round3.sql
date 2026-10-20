-- ── SURVEY ROUND 3: TWO NEW ANSWERS ─────────────────────────────────────────────────────────────────────────
-- Rounds 1 and 2 asked which system you like most, which least, and a free line. Round 3 keeps the first and
-- the last and replaces the middle with a different question, so the columns are ADDED rather than reused.
--
-- ⚠️ `least` IS NOT REPURPOSED, AND THAT IS THE POINT. "Which do you like least" and "which would you like
-- more of" are not the same question dressed differently — a member can want more of the thing they already
-- love. Writing the new answer into the old column would silently change what two rounds of existing data
-- mean, and nobody would ever find out. One column, one question, for ever.
--
--   more  the system they want the next few months spent on
--   pace  whether they want the Den to stay something you check on, or to grow something you actively play
--
-- Both nullable: every step of the survey is skippable, and a skipped step must be distinguishable from an
-- answer rather than collapsing into a default.
ALTER TABLE mkt_survey_response ADD COLUMN IF NOT EXISTS more text;
ALTER TABLE mkt_survey_response ADD COLUMN IF NOT EXISTS pace text;
