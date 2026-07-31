-- ═══ THE KITCHEN ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Harvesting a crop and landing a fish both pay out and then throw the thing itself away. The gold stays (it
-- reads as selling, and the farm's economy is balanced around it) but you now ALSO keep the produce and the
-- catch, and those are what you cook with.
--
-- Recipes are LEARNED, not listed — they turn up in chests, digs, raids, the merchant, harvests. A recipe has a
-- tier, and the tier decides how good the dish is: cooking rolls a random consumable from that tier's pool, so
-- one recipe stays interesting for more than one cook.

-- What you're holding. One row per ingredient, `kind` separating crops from fish so a species and a seed can
-- never collide on id.
CREATE TABLE IF NOT EXISTS mkt_pantry (
    buyer_id UUID NOT NULL,
    kind     TEXT NOT NULL,          -- 'crop' | 'fish'
    ref      TEXT NOT NULL,          -- seed id, or fish species id
    qty      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS mkt_pantry_buyer ON mkt_pantry (buyer_id) WHERE qty > 0;

-- Recipes this member has found. `times_cooked` drives the cooking badges and the mastery bonus.
CREATE TABLE IF NOT EXISTS mkt_recipe_known (
    buyer_id     UUID NOT NULL,
    recipe_id    TEXT NOT NULL,
    learned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    times_cooked INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, recipe_id)
);

-- Per-member kitchen: the upgrade tracks and the daily counter, mirroring how mkt_sailing carries the boat.
CREATE TABLE IF NOT EXISTS mkt_kitchen (
    buyer_id       UUID PRIMARY KEY,
    cook_xp        INTEGER NOT NULL DEFAULT 0,
    cooks_total    INTEGER NOT NULL DEFAULT 0,
    heat_level     INTEGER NOT NULL DEFAULT 0,   -- chance the dish comes out a tier better
    season_level   INTEGER NOT NULL DEFAULT 0,   -- chance of a bonus portion
    batch_level    INTEGER NOT NULL DEFAULT 0,   -- extra cooks per day
    larder_level   INTEGER NOT NULL DEFAULT 0,   -- chance an ingredient isn't consumed
    cook_day       DATE,
    cooks_today    INTEGER NOT NULL DEFAULT 0,
    best_dish_tier INTEGER NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cooking badges. Art is generated through the normal badge pipeline, never emoji.
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order, admin_only, drop_only, secret) VALUES
    ('cook_first',     'First Course',    'Cooked your first dish',                       '🍳', '#e8a33d', 240, FALSE, FALSE, FALSE),
    ('cook_apprentice','Line Cook',       'Cooked 25 dishes',                             '🥘', '#e8a33d', 241, FALSE, FALSE, FALSE),
    ('cook_chef',      'Chef',            'Cooked 100 dishes',                            '👨‍🍳', '#e8a33d', 242, FALSE, FALSE, FALSE),
    ('cook_master',    'Master of the Pass', 'Cooked 400 dishes',                         '⭐', '#ffd75e', 243, FALSE, FALSE, FALSE),
    ('cook_collector', 'Recipe Collector', 'Learned 10 recipes',                          '📜', '#c9a2ff', 244, FALSE, FALSE, FALSE),
    ('cook_librarian', 'The Whole Book',   'Learned every recipe',                        '📚', '#ffd75e', 245, FALSE, FALSE, FALSE),
    ('cook_legendary', 'Legendary Plate',  'Cooked a legendary dish',                     '🍽️', '#ffd75e', 246, FALSE, FALSE, FALSE),
    ('cook_forager',   'Well Stocked',     'Held 100 ingredients at once',                '🧺', '#4ad07f', 247, FALSE, FALSE, FALSE)
ON CONFLICT (slug) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description, icon = EXCLUDED.icon, color = EXCLUDED.color;
