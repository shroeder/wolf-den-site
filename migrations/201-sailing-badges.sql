-- Sailing/raid/dig achievement badges — deliberately HARD to earn (secret until earned, like the merchant ones).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('raid_marauder',    'Marauder',            'Won 25 raids on the high seas.',                       '🏴‍☠️', '#ff6a5a', FALSE, NULL, NULL, TRUE, 140),
    ('raid_scourge',     'Scourge of the Seas', 'Won 100 raids — a terror on the water.',               '☠️',   '#e0415c', FALSE, NULL, NULL, TRUE, 141),
    ('raid_untouchable', 'Untouchable',         'Won a raid without your ship taking a single hit.',    '🛡️',   '#7fd8ff', FALSE, NULL, NULL, TRUE, 142),
    ('raid_plunderer',   'Plunderer',           'Plundered a copy of a rival''s item in a raid.',       '💎',   '#c99bff', FALSE, NULL, NULL, TRUE, 143),
    ('dig_excavator',    'Master Excavator',    'Forged 50 treasure chests from dig fragments.',        '⛏️',   '#ffcf6a', FALSE, NULL, NULL, TRUE, 144),
    ('dig_goldtouch',    'Golden Touch',        'Forged a gold-tier treasure chest or better.',         '🏆',   '#ffd75e', FALSE, NULL, NULL, TRUE, 145),
    ('dig_cleansweep',   'Clean Sweep',         'Fully uncovered a deep buried chest in one dig.',      '✨',   '#7cffb2', FALSE, NULL, NULL, TRUE, 146),
    ('sail_leviathan',   'Leviathan''s Master', 'Commanded the Leviathan Dreadnought (level 90).',      '🐉',   '#35d07f', FALSE, NULL, NULL, TRUE, 147),
    ('sail_admiral',     'Fleet Admiral',       'Commanded the Celestial Warship — the ultimate hull.', '⚓',   '#ffd75e', FALSE, NULL, NULL, TRUE, 148),
    ('sail_voyager',     'Seasoned Voyager',    'Completed 100 voyages.',                               '🧭',   '#8fd8ff', FALSE, NULL, NULL, TRUE, 149)
ON CONFLICT (slug) DO NOTHING;

-- Lifetime counters that drive the milestone badges.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raids_won INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS chests_forged INTEGER NOT NULL DEFAULT 0;
