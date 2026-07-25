-- Non-combat activity consumables (buyable boosts for farming / petting / liking).
-- Small per-buyer state the new consumables need:
--   • farm_harvest_luck  — remaining "Harvest Charm" charges; each pending charge bumps a harvest's loot-tier
--                          promote chance, then decrements (a use-count, NOT a daily reset).
--   • pet_farm_extra     — extra OWN-pet pettings granted TODAY by "Pettin' Whistle"; day-reset store-local
--                          (America/Chicago) alongside the other pet_farm_* counters.
--   • farm_rate_bonus    — extra farm-rating charges granted TODAY by "Kindness Token"; day-reset store-local
--                          alongside farm_rate_used.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_harvest_luck INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_farm_extra    INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_rate_bonus   INT NOT NULL DEFAULT 0;
