-- Once-per-day paid re-rolls: 1500 gold to reroll the daily quests, and a gold reroll of the special shop
-- (Today's Deals). One reset each per store-day; the DATE marks the day the member used their reset.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS quest_reset_day DATE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS deal_reset_day DATE;
