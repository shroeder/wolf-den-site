-- ── SHIP BATTLES ────────────────────────────────────────────────────────────────────────────────────────────
-- Raiding is being rebuilt from "two captains trade blows" into a fight between SHIPS: how many guns you carry,
-- how well your crew lays them, how much hull you can eat, and what you loaded into the barrels.
--
-- Three combat tracks, deliberately SEPARATE from the five sailing tracks that make up boat level: boat level
-- still means "how much boat have you built" (it drives the hull art, the voyage perks and the fleet board), and
-- inflating it with gunnery purchases would silently re-tier everyone's ship and their place on that board.
-- Combat reads both — the ship you sail plus the guns you bought for it.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS gun_level integer NOT NULL DEFAULT 0;      -- Cannons: broadside size
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS gunnery_level integer NOT NULL DEFAULT 0;  -- Gunnery: accuracy + raking shots
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS hull_level integer NOT NULL DEFAULT 0;     -- Hull: hit points + armour

-- Doubloons: won from ship battles, spent on ammunition and gun-deck upgrades. A currency the rest of the game
-- cannot mint, so the Quartermaster is worth caring about.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS doubloons integer NOT NULL DEFAULT 0;

-- Ammunition. Round shot is unlocked forever and never runs out; the exotic types are stock you spend, held
-- here as { ammo_id: count }. `loadout` is what is currently in the racks.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS ammo jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS loadout text NOT NULL DEFAULT 'round';

-- The fleet ladder: how deep into the pirate fleet you have fought. `fleet_depth` is the highest rank BEATEN
-- (so depth+1 is what you sail against next) and `fleet_best` is the high-water mark for the board — a lost
-- battle never costs progress, because a ladder that takes rungs away stops being one people climb.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fleet_depth integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fleet_best integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fleet_wins integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fleet_losses integer NOT NULL DEFAULT 0;
-- Daily fleet sorties, counted the same way raids are (a count + the day it belongs to).
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fleet_day date;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fleet_count integer NOT NULL DEFAULT 0;

-- The board reads fleet_best; index it so ranking never scans the table.
CREATE INDEX IF NOT EXISTS mkt_sailing_fleet_best_idx ON mkt_sailing (fleet_best DESC) WHERE fleet_best > 0;
