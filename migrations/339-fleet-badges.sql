-- Milestones down the pirate fleet. Every other system in the game marks its walls; the fleet was minting
-- doubloons and recording nothing, so sinking Admiral Vane looked exactly like sinking a fishing boat.
--
-- SECRET and not admin_only, matching the Forge badges: they stay hidden until earned, which is the right
-- shape for a ladder whose later rungs are a spoiler. They are unearnable by anyone outside the dev allow-list
-- for now anyway, because the whole feature is gated (see raidsEnabled in sailing.js).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('fleet_first_blood', 'First Blood',  'Sank your first ship from the pirate fleet.',                              '⚓', '#9fe6ff', FALSE, NULL, NULL, TRUE, 940),
    ('fleet_meg',         'Meg''s Match',  'Put Salt Meg''s Revenge on the bottom — the fleet''s first real wall.',    '🏴', '#ff9a6b', FALSE, NULL, NULL, TRUE, 941),
    ('fleet_tithe',       'Tithe Breaker','Sank The Black Tithe. It does not get to take a tenth of yours.',          '⚔️', '#ffd75e', FALSE, NULL, NULL, TRUE, 942),
    ('fleet_admiral',     'Vane''s End',   'Sank Admiral Vane''s Sovereign. There is nothing left of the fleet.',      '👑', '#ff5cc8', FALSE, NULL, NULL, TRUE, 943),
    ('fleet_unscathed',   'Not a Plank',  'Won a fleet battle without taking a single hit.',                          '🛡️', '#37f5c0', FALSE, NULL, NULL, TRUE, 944)
ON CONFLICT (slug) DO NOTHING;
