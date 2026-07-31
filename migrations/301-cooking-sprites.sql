-- Art for everything the Kitchen shows. Dishes and prepped ingredients both live here, keyed by their id, so
-- one table answers "what does this look like" for the whole feature.
--
-- Raw ingredients deliberately DON'T go in here — crops already have `crop_<id>_ripe` in mkt_town_art and fish
-- already have /images/fish/<id>.png on disk. Generating those again would be paying twice for a picture we
-- already own.
CREATE TABLE IF NOT EXISTS mkt_cooking_sprite (
    ref        TEXT PRIMARY KEY,     -- recipe id (r_*/k_*) or prep id (p_*)
    url        TEXT NOT NULL,
    prompt     TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Harder cooking badges. The first set were all reachable in a week; these are the ones worth chasing.
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order, admin_only, drop_only, secret) VALUES
    ('cook_prep',      'Mise en Place',    'Prepped 50 ingredients',                    '🔪', '#4ad07f', 248, FALSE, FALSE, FALSE),
    ('cook_perfect',   'Perfect Plate',    'Cooked a dish with a flawless timing run',  '💯', '#7ec8ff', 249, FALSE, FALSE, FALSE),
    ('cook_chain',     'On the Pass',      'Hit a 10-chain while cooking',              '🔗', '#c9a2ff', 250, FALSE, FALSE, FALSE),
    ('cook_every_tier','Full Menu',        'Cooked a dish of every tier',               '📖', '#ffd75e', 251, FALSE, FALSE, FALSE),
    ('cook_thousand',  'Thousand Covers',  'Cooked 1,000 dishes',                       '🏅', '#ffd75e', 252, FALSE, FALSE, FALSE),
    ('cook_grand',     'The Grand Feast',  'Cooked The Grand Feast',                    '👑', '#ff9ec4', 253, FALSE, FALSE, FALSE),
    ('cook_wolfs',     'Head of the Table','Cooked The Wolf''s Table',                  '🐺', '#ff9ec4', 254, FALSE, FALSE, FALSE)
ON CONFLICT (slug) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description, icon = EXCLUDED.icon, color = EXCLUDED.color;

-- Cooking tracks the best timing run and the longest chain, so the skill badges have something to read.
ALTER TABLE mkt_kitchen ADD COLUMN IF NOT EXISTS best_quality NUMERIC(4,3) NOT NULL DEFAULT 0;
ALTER TABLE mkt_kitchen ADD COLUMN IF NOT EXISTS best_chain   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_kitchen ADD COLUMN IF NOT EXISTS preps_total  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_kitchen ADD COLUMN IF NOT EXISTS tiers_cooked INTEGER NOT NULL DEFAULT 0; -- bitmask, tier 1 = bit 0
