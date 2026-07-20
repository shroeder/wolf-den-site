-- Pet-leveling milestone badges (auto-granted by syncEarnedBadges via the new pet-level rules).
--   pet_level_reached → highest single-pet level; pets_maxed → # of pets at Lv5; pet_levels_total → levels gained.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('pet_trained',  'Companion Trained', 'Leveled a pet to Lv 2',        '🐾', '#8fe0a0', FALSE, 'pet_level_reached', 2,   67),
    ('pet_seasoned', 'Seasoned Trainer',  'Maxed a pet to Lv 5',          '⭐', '#ffd75e', FALSE, 'pet_level_reached', 5,   68),
    ('pack_leader',  'Pack Leader',       'Maxed 3 pets to Lv 5',         '🎖️', '#ff9a6a', FALSE, 'pets_maxed',        3,   69),
    ('beastmaster',  'Beastmaster',       'Maxed 10 pets to Lv 5',        '👑', '#ffb14a', FALSE, 'pets_maxed',        10,  70),
    ('pet_devoted',  'Devoted',           'Gained 100 total pet levels',  '🏆', '#b76bff', FALSE, 'pet_levels_total',  100, 71)
ON CONFLICT (slug) DO NOTHING;
