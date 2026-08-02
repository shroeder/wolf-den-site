-- Farm ratings become repeatable DAILY against the same person, instead of once per pair forever.
--
-- The row stays one-per-pair (a farm's "12 people love this" must not become "12 because one person clicked
-- daily for a fortnight"), so this is a per-target cooldown rather than an event log: last_rated_day records
-- the store-local day you last rated that person, and a fresh day re-arms them.
--
-- Backfilled from created_at so every existing rating is immediately re-ratable — except one made TODAY,
-- which correctly stays on cooldown until tomorrow.
ALTER TABLE mkt_farm_rating ADD COLUMN IF NOT EXISTS last_rated_day DATE;
UPDATE mkt_farm_rating
   SET last_rated_day = (COALESCE(updated_at, created_at) AT TIME ZONE 'America/Chicago')::date
 WHERE last_rated_day IS NULL;
