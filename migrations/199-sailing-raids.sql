-- RAIDS: once/day full-screen auto-battle against a passing player. Plus a 5th boat upgrade track
-- ("Raiding" / raid-dodge) that gives a small chance NOT to consume the daily raid.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raid_level INTEGER NOT NULL DEFAULT 0; -- the 5th upgrade track
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raid_day DATE;                          -- store-local day the daily raid was used
