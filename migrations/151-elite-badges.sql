-- Badges that auto-unlock from owning the game's rarest gear (Ascendant / Eternal). Rules evaluated by
-- badges.js: 'elite_items' = count of Ascendant+Eternal items owned; 'eternal_items' = Eternal items owned.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('ascended',       'Ascended',       'Own a piece of Ascendant gear',        '🌟', '#ff7a3c', FALSE, 'elite_items',   1, 140),
    ('transcendent',   'Transcendent',   'Own 3 pieces of elite (Ascendant+) gear', '💠', '#8b6cff', FALSE, 'elite_items',   3, 141),
    ('eternal_bearer', 'Eternal Bearer', 'Wield an Eternal relic — the pinnacle', '👑', '#ff5cc8', FALSE, 'eternal_items', 1, 142)
ON CONFLICT (slug) DO NOTHING;
