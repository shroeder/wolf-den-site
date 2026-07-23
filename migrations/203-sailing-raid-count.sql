-- Count-based daily raids so ship/set perks can grant more than one raid per day.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raid_count INTEGER NOT NULL DEFAULT 0;
