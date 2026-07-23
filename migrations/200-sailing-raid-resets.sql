-- Buy another raid after you've used your daily one — cost escalates with each reset that day.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raid_resets INTEGER NOT NULL DEFAULT 0; -- resets bought today
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raid_reset_day DATE;                     -- store-local day those resets count for
