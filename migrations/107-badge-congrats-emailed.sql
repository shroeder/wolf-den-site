-- Track when we've emailed a member a congrats for a badge, so the auto-backfill sends each exactly
-- once (and never re-spams). NULL = not yet emailed.
ALTER TABLE mkt_user_badge ADD COLUMN IF NOT EXISTS congrats_emailed_at TIMESTAMPTZ;
