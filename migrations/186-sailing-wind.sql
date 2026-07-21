-- Once-a-day "favorable winds" boost: shaves an hour off the current voyage. Track the store-local (Chicago)
-- day it was last used so it can only be used once per day.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS wind_day DATE;
