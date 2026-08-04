-- DUNGEON DELVES — a run-based, floor-by-floor push through a themed dungeon.
--
-- Four dungeons gated on level (10 / 20 / 30 / 50), ten floors each, one encounter a floor, a boss at the
-- bottom. You carry HP and potions in; you leave with whatever you banked, alive or not.
--
-- The RUN lives in one JSONB column rather than a table of floors. A run is short (ten floors), always belongs
-- to exactly one player, and is read and rewritten whole on every tap — the same shape mkt_mining.run_json uses
-- for a descent, and for the same reason: a row per floor would be six writes and a join to answer "where am I".
--
-- `runs_json` is { [dungeonId]: 'YYYY-MM-DD' } — the store-local day you last STARTED that dungeon, which is
-- what makes each dungeon once-a-day independently. A map rather than four columns so a fifth dungeon is a
-- catalog edit and not a migration.
CREATE TABLE IF NOT EXISTS mkt_delve (
    buyer_id        UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    run_json        JSONB,                        -- the run in progress, or NULL
    runs_json       JSONB NOT NULL DEFAULT '{}',  -- { dungeonId: last-started day }
    -- Upgrades, bought with gold and permanent.
    flask_level     INT NOT NULL DEFAULT 0,       -- each level: potions heal more
    satchel_level   INT NOT NULL DEFAULT 0,       -- each level: +1 potion at the door
    ward_level      INT NOT NULL DEFAULT 0,       -- each level: take slightly less damage
    -- Lifetime counters, for badges and the stats strip.
    runs_started    INT NOT NULL DEFAULT 0,
    runs_cleared    INT NOT NULL DEFAULT 0,       -- boss killed
    runs_died       INT NOT NULL DEFAULT 0,
    floors_cleared  INT NOT NULL DEFAULT 0,
    bosses_felled   INT NOT NULL DEFAULT 0,
    deepest_floor   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BADGES ───────────────────────────────────────────────────────────────────────────────────────────────
-- Same bar as the mining set: days of play, not one tap. Thresholds assume a level-50 delver clearing up to
-- four dungeons a day, so "100 floors" is roughly a fortnight and "all four bosses" needs level 50 plus luck.
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order) VALUES
    ('delve_first_boss', 'Torchbearer',    'Felled your first dungeon boss.',                      '🔥', '#ffb45e', 260),
    ('delve_floors_100','Deep Wanderer',   'Cleared 100 dungeon floors.',                          '🗝️', '#8fd8ff', 261),
    ('delve_floors_500','Labyrinthine',    'Cleared 500 dungeon floors.',                          '🧭', '#b98cff', 262),
    ('delve_flawless',  'Unscathed',       'Cleared a dungeon without dropping below half health.', '🛡️', '#7cffb2', 263),
    ('delve_all_four',  'Master of Depths','Felled the boss of all four dungeons.',                 '👑', '#ffd75e', 264),
    ('delve_bosses_25', 'Bane of the Deep','Felled 25 dungeon bosses.',                            '⚔️', '#ff8f9a', 265),
    ('delve_no_potion', 'Ironblood',       'Cleared a dungeon without drinking a single potion.',   '🩸', '#ff6f7d', 266)
ON CONFLICT (slug) DO NOTHING;
