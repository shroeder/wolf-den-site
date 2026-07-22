-- Digging upgrade system (separate from the boat): five gold-leveled tracks that change HOW you dig — more
-- stamina, chance to pierce all layers, chance to strike a lucky bonus fragment, chance a tool doesn't spend
-- its charge, and chance a dig spawns an explosion. (Area-clear TOOLS unlock every 10 excavation levels, which
-- are derived from voyages_completed — no column needed.)
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_stamina_level   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_pierce_level    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_strike_level    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_efficient_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_detonator_level INTEGER NOT NULL DEFAULT 0;
