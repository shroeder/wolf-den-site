-- Daily passive-income recap: accumulate what a member's pets earned since their last recap, so we can show a
-- "while you were away" summary once a day. recap_shown_at gates it to once per store-local day.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS recap_xp        BIGINT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS recap_gold      BIGINT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS recap_shown_at  TIMESTAMPTZ;
