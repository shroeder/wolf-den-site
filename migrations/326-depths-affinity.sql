-- THE DEPTHS: gear, pets and badges finally reach the Mine.
--
-- The mine shipped reading nothing off your loadout — full mythic gear and a legendary pet changed neither the
-- collapse rate, the ore a seam paid, nor what came out of the furnace. This adds the state the new affinity
-- layer needs, plus badges for the three verbs so the Depths bonuses have somewhere to come from.

-- The Delver's Kit capstone ("Second Wind") saves your haul from the day's FIRST collapse. Dated so it is
-- genuinely once a day rather than once a page-load; the guarded UPDATE in mining.js is what claims it.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS second_wind_day DATE;

-- Counters the new badges need. ore_smelted and nodes_mined already exist (mig 322/325); these are the ones
-- the delving and smelting ladders were missing.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS steps_taken INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS smelts_poured INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS flawless_pours INT NOT NULL DEFAULT 0;

-- ── NEW BADGES ───────────────────────────────────────────────────────────────────────────────────────────
-- Same bar as mig 325: a badge should take days to earn, not one tap. These fill the gaps — the old set had
-- nothing at all for the DESCENT as an activity (only "reached depth 12" and "dug at depth 10"), and nothing
-- for the smelt beyond a single 1,000-ore lifetime counter with no rungs on the way up.
--
-- Thresholds are set against a 3-trip day: ~15-20 steps, ~3 seams and a handful of pours if you play daily.
--   Tunnel Rat     300 steps    ≈ 2-3 weeks
--   Deepwalker     1,000 steps  ≈ 2 months
--   Pour Steady    100 pours    ≈ 2 weeks
--   Ladle Master   500 pours    ≈ 2 months
--   Not a Drop     25 FLAWLESS pours — skill, not time; the tightest band in the game, five times a smelt
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order) VALUES
    ('mine_tunnelrat',  'Tunnel Rat',   'Took 300 steps down the mine tunnel.',        '🪜', '#c39b6a', 247),
    ('mine_deepwalker', 'Deepwalker',   'Took 1,000 steps down the mine tunnel.',      '🕳️', '#8fd8ff', 248),
    ('mine_poursteady', 'Pour Steady',  'Poured 100 smelts at the furnace.',           '🔥', '#ff9f1c', 249),
    ('mine_ladle',      'Ladle Master', 'Poured 500 smelts at the furnace.',           '⚗️', '#ffd75e', 250),
    ('mine_notadrop',   'Not a Drop',   'Landed 25 FLAWLESS pours — dead centre, five times a smelt.', '💎', '#ff9ec4', 251)
ON CONFLICT (slug) DO NOTHING;
