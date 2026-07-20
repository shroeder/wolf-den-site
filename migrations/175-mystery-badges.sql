-- Mystery-bag badges + the metrics that drive them. Bags are sold in the real store, so a member's count
-- is credited by staff at checkout (admin action) — there's no automatic online→member link. `mystery_big_hit`
-- flags a member who pulled a notable hit from a bag.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS mystery_bags_bought INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS mystery_big_hit BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO mkt_badge (slug, label, description, icon, color, auto_rule, auto_threshold, sort_order) VALUES
    ('mystery_first',   'Grab Bagger', 'Bought a mystery bag from The Wolf Den.',            '🎁', '#7cf5c4', 'mystery_bags',    1,   104),
    ('mystery_big_hit', 'Big Hit',     'Pulled a big hit out of a mystery bag!',             '💥', '#ffd75e', 'mystery_big_hit', 1,   105),
    ('mystery_20',      'Bag Fiend',   'Bought 20+ mystery bags.',                           '🛍️', '#b061ff', 'mystery_bags',    20,  106),
    ('mystery_100',     'Bag Legend',  'Bought 100+ mystery bags — a true believer.',        '👑', '#ff9f1c', 'mystery_bags',    100, 107)
ON CONFLICT (slug) DO NOTHING;
