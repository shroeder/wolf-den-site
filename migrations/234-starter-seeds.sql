-- Every member starts with a few low-level seeds so the farm loop is obvious from day one (adoption was low
-- because new players landed on an empty plot with nothing to plant). New accounts get the grant at signup
-- via grantStarterSeeds(); this migration backfills everyone who already exists, then marks them so the
-- runtime grant never double-applies.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS starter_seeds_granted BOOLEAN NOT NULL DEFAULT false;

-- Backfill the starter bag for existing members who haven't been granted yet.
INSERT INTO mkt_farm_seed (buyer_id, seed_id, count)
SELECT b.id, s.seed_id, s.count
  FROM mkt_buyer b
  CROSS JOIN (VALUES ('wheat', 3), ('carrot', 3), ('potato', 3)) AS s(seed_id, count)
 WHERE b.starter_seeds_granted = false
ON CONFLICT (buyer_id, seed_id)
  DO UPDATE SET count = mkt_farm_seed.count + EXCLUDED.count;

UPDATE mkt_buyer SET starter_seeds_granted = true WHERE starter_seeds_granted = false;
