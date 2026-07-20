-- Escalating cost for buying an extra spin: 1000 gold for the first buy of the day, +1000 each additional,
-- reset at midnight (store-local / America-Chicago) day. Tracks how many extra spins were bought today.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spin_buys_day DATE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spin_buys_count INTEGER NOT NULL DEFAULT 0;
