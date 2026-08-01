-- Truffle Hog: a companion perk can bring the Loot Pig back for ONE extra visit in the same store-local day.
--
-- Its own column rather than a counter on pig_day, so the second claim is spent atomically exactly the way the
-- first one is (`WHERE pig_second_day IS DISTINCT FROM today`). A counter would need a read-modify-write and
-- could be raced by two taps into a double payout.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pig_second_day DATE;
