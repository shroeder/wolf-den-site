-- Harvest encounters: when a creature raids a harvest, the pending fight (creature + pre-rolled reward) is
-- parked on the member's row so the WIN can't be faked client-side — resolve reads + clears it atomically and
-- grants the pre-rolled loot (scaled by how well the player nailed the timing). One pending encounter at a time.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_encounter JSONB;
