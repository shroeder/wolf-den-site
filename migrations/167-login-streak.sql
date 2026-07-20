-- Daily check-in / login streak: consecutive days the member claimed their daily reward. streak_claimed_day
-- is the last day claimed (also gates the once-per-day modal). No cron — the streak is evaluated from the
-- date gap when they check in.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS login_streak INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS streak_claimed_day DATE;
