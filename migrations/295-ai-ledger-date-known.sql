-- Stop the ledger inventing timestamps.
--
-- Reconstructed rows fell back to `now()` whenever the source table had no date to offer, which stamped them
-- with the moment the backfill happened to run. Three boss backgrounds drawn on Jul 16, Jul 20 and Jul 25 all
-- appeared at 07-31 02:33, side by side, as though they were made together. In a screen whose entire job is
-- showing WHEN things happened, a plausible-looking wrong date is worse than an obvious gap: it can't be
-- questioned, so it gets believed.
--
-- date_known = FALSE marks a row whose real time we genuinely don't have. The app shows those as "date
-- unknown" and sorts them out of the timeline instead of dropping them into it at a fictional position.
ALTER TABLE mkt_ai_generation ADD COLUMN IF NOT EXISTS date_known BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_gen_date_known ON mkt_ai_generation (date_known, created_at DESC);
