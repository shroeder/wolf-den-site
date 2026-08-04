-- FARM RATING: the tally counts VOTES, not distinct raters.
--
-- A rating row is one per (rater -> owner), and the farm's tally was COUNT(*) over those rows. So rating
-- somebody a second time on a second day spent a charge, paid XP to both sides, and moved their number by
-- exactly nothing — you could visit a friend's farm every day for a week and their total would sit still.
--
-- `votes` is how many times you have turned up and cast your rating. The row still holds your CURRENT tier —
-- that is your standing opinion, and changing it re-colours every vote you have cast — but the tally is now
-- SUM(votes), so showing up repeatedly actually adds up. The rule that got you here is unchanged: three votes
-- a day, at most one per person per day, so the three still have to be spread across three farms.
--
-- Backfill is 1: every rating that exists today is one vote, which is exactly what it was worth before.
ALTER TABLE mkt_farm_rating ADD COLUMN IF NOT EXISTS votes INT NOT NULL DEFAULT 1;

-- The standings query sums votes per owner.
CREATE INDEX IF NOT EXISTS idx_farm_rating_owner_votes ON mkt_farm_rating (owner_id, votes);
