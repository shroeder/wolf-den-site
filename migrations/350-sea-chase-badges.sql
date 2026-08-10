-- THE BESTIARY, AND FIVE THINGS WORTH CHASING.
--
-- `encounters_won` is a count, and a count cannot answer "have you beaten all twenty of them" — the badge that
-- matters most here is the one that asks you to go and find the fights you have been sailing past. So the ids
-- themselves are kept, as a jsonb array, which is also the shape a bestiary screen would want later.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounters_beaten jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The chase badges for fights at sea. Secret (NULL auto_rule) like every other sailing badge — they are
-- granted in code at the moment they are earned, in finishEncounterBattle.
--
-- These are deliberately not a ladder of counts. "Win 10, win 50, win 100" is the shape sailing already has
-- twice over, and a counter is not a chase — it is a wait. Each of these asks you to do something specific
-- and slightly awkward: pick a fight above your weight, come out of one clean, finish one with the Reckoning,
-- or go and find the four you have never met.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order) VALUES
    ('first_blood_sea',  'First Blood',      'Won your first fight at sea',                       '🩸', '#c2453f', FALSE, TRUE, NULL, NULL, 217),
    ('monster_hunter',   'Monster Hunter',   'Killed 25 sea monsters',                            '🦑', '#7a4fd0', FALSE, TRUE, NULL, NULL, 218),
    ('leviathan_slayer', 'Leviathan Slayer', 'Sank one of the five great terrors of the deep',    '🐉', '#ff6854', FALSE, TRUE, NULL, NULL, 219),
    ('sea_unscathed',    'Not a Scratch',    'Won a fight at sea without losing a single plank',  '✨', '#7ec8e3', FALSE, TRUE, NULL, NULL, 220),
    ('reckoning_kill',   'Answered in Full', 'Ended a fight at sea with the Reckoning',           '⚡', '#ffd75e', FALSE, TRUE, NULL, NULL, 221),
    ('full_bestiary',    'The Whole Sea',    'Beat all twenty things that sail these waters',     '📖', '#37f5c0', FALSE, TRUE, NULL, NULL, 222)
ON CONFLICT (slug) DO NOTHING;
