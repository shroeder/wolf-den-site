-- Sailing: two more boat upgrade tracks so the boat has FOUR travel/loot levers (all boat-exclusive; dig count
-- is a separate future system). Speed + Fortune already exist (speed_level, luck_level). Rarity = better loot
-- quality; Luck = your early digs strike fragments sooner. Each of the four tracks maxes at 20 → 80 upgrade
-- levels → a new boat FORM (+ a permanent perk) every 10 levels across 8 forms.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS rarity_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS find_level   INTEGER NOT NULL DEFAULT 0; -- the "Luck" lever
