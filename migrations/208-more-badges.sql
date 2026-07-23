-- More badges: cover the mechanics that had none (waving, mid-voyage marine encounters, early voyages), and
-- re-insert 3 badges that were silently DROPPED by slug collisions (their intended rows never landed because a
-- different, earlier badge already owned the slug via ON CONFLICT DO NOTHING).

-- Cumulative counters for the event-granted sailing badges (daily wave_count already exists but resets).
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS waves_total      INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounters_total INT NOT NULL DEFAULT 0;

-- Event-granted (secret, NULL auto_rule) — matches the existing sailing/raid/dig badge style; granted in code
-- at thresholds. icon is a placeholder emoji; the badge-art pipeline will overlay generated art.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order) VALUES
    ('wave_friendly',   'Friendly Sailor',    'Waved to 25 passing ships',        '👋', '#7ec8e3', FALSE, TRUE, NULL, NULL, 210),
    ('wave_ambassador', 'Sea Ambassador',     'Waved to 100 passing ships',       '🫡', '#4aa3d4', FALSE, TRUE, NULL, NULL, 211),
    ('wave_beloved',    'Beloved of the Sea', 'Waved to 500 passing ships',       '🌊', '#2f7fb5', FALSE, TRUE, NULL, NULL, 212),
    ('sea_tested',      'Storm-Tested',       'Survived 10 marine encounters',    '🌩️', '#8a7dd0', FALSE, TRUE, NULL, NULL, 213),
    ('sea_veteran',     'Old Salt',           'Survived 50 marine encounters',    '⚓', '#5c6b9a', FALSE, TRUE, NULL, NULL, 214),
    ('first_voyage',    'Maiden Voyage',      'Completed your first voyage',      '⛵', '#6fce9f', FALSE, TRUE, NULL, NULL, 215),
    ('sail_regular',    'Seasoned Sailor',    'Completed 25 voyages',             '🧭', '#4bb98a', FALSE, TRUE, NULL, NULL, 216)
ON CONFLICT (slug) DO NOTHING;

-- Collision fixes — re-insert under fresh slugs with distinct labels (the metrics elite_items / pets_maxed /
-- event_donated already exist in getMemberMetrics, so these auto-earn like their siblings).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order) VALUES
    ('ascendant_gear',  'Ascendant Bearer', 'Own a piece of Ascendant gear',    '🌟', '#ff7a3c', FALSE, FALSE, 'elite_items',   1,     143),
    ('pack_master',     'Pack Master',      'Maxed 3 pets to Lv 5',             '🎖️', '#ff9a6a', FALSE, FALSE, 'pets_maxed',    3,     72),
    ('gold_benefactor', 'Gold Benefactor',  'Donated 25,000 gold to the pack',  '💛', '#ffd75e', FALSE, FALSE, 'event_donated', 25000, 75)
ON CONFLICT (slug) DO NOTHING;
