-- The Wild Loot Pig: a crowned pig that randomly rampages across your farm once a day, dropping gold (+ a rare
-- item). pig_day records the last store-local day you collected its haul, so it only pays out once per day.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pig_day DATE;
