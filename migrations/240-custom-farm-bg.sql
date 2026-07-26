-- Custom farm background: a player-generated scene that replaces the weather/time-of-day backdrops.
--   farm_bg_url       = the ACCEPTED background (null → default weather backdrops).
--   farm_bg_draft_url = a generated-but-not-yet-accepted PREVIEW (3 creation tokens charged on generate).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_bg_url TEXT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_bg_draft_url TEXT;
