-- Farm petting is now a shared daily budget (not once-per-pet): 3 pets/day total, rechargeable for gold at a
-- doubling cost. Track the day, how many pettings were used, and how many recharges were bought that day.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_farm_day        DATE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_farm_used       INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_farm_recharges  INT NOT NULL DEFAULT 0;
