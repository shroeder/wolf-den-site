-- 1) The 1st/2nd/3rd-place badges are cron-synced to the leaderboard leaders — they should NOT be admin-
--    assignable. Flip them off admin_only (removes them from the "you assign" list) and tag an auto_rule so
--    they're categorized as auto-managed. syncLeaderboardBadges still grants/revokes them.
UPDATE mkt_badge SET admin_only = FALSE, auto_rule = 'leaderboard_place', auto_threshold = 1
 WHERE slug IN ('place_1', 'place_2', 'place_3');

-- 2) A lot more ASSIGNABLE (admin-only) roles & recognition.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, sort_order) VALUES
    ('tournament_champ', 'Tournament Champ',  'Won a Wolf Den tournament',             '🏆', '#d4af37', TRUE, 33),
    ('draft_king',       'Draft King',        'A feared drafter',                      '🃏', '#7a5cff', TRUE, 34),
    ('commander',        'Commander',         'Commander night regular',               '⚔️', '#b0562f', TRUE, 35),
    ('lore_master',      'Lore Master',       'Knows every card and story',            '📖', '#4a90d9', TRUE, 36),
    ('featured_artist',  'Featured Artist',   'Artwork featured at the Den',           '🎨', '#e0743a', TRUE, 37),
    ('trade_master',     'Trade Master',      'A trusted, prolific trader',            '🤝', '#2fa27a', TRUE, 38),
    ('content_creator',  'Content Creator',   'Creates content for the community',     '🎥', '#c8508f', TRUE, 39),
    ('og',               'OG',                'One of the originals',                  '🕶️', '#888888', TRUE, 40),
    ('birthday_star',    'Birthday Star',     'Celebrated a birthday at the Den',      '🎂', '#e05a8f', TRUE, 41),
    ('generous',         'Generous Soul',     'Known for giving back to the pack',     '💝', '#e0743a', TRUE, 42),
    ('hype_master',      'Hype Master',       'Brings the energy every event',         '📣', '#d9a441', TRUE, 43),
    ('rival',            'Rival',             'A worthy in-store rival',               '⚡', '#c8a24a', TRUE, 44)
ON CONFLICT (slug) DO NOTHING;

-- 3) A lot more UNLOCKABLE (auto-earned) milestones — using existing rule keys with higher bars.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('veteran',          'Veteran',           'Reached Level 75',                      '🎖️', '#8a5a2b', FALSE, 'level',        75,   53),
    ('living_legend',    'Living Legend',     'Reached Level 100',                     '🌟', '#ffd75e', FALSE, 'level',        100,  54),
    ('high_roller_badge','High Roller',       'Spent $5,000 with The Wolf Den',        '💎', '#37e0a1', FALSE, 'spend',        5000, 62),
    ('legendary_spend',  'Legendary Patron',  'Spent $10,000 with The Wolf Den',       '👑', '#ffcf40', FALSE, 'spend',        10000,63),
    ('event_legend',     'Event Legend',      'Checked in at 50 events',               '🎯', '#7a5cff', FALSE, 'events',       50,   72),
    ('event_god',        'Event God',         'Checked in at 100 events',              '🔱', '#c8a24a', FALSE, 'events',       100,  73),
    ('two_year',         'Two Years Strong',  'A Wolf Den member for two years',       '📆', '#b0562f', FALSE, 'tenure_days',  730,  83),
    ('always_here',      'Always Here',       'Active on 200 different days',          '🔆', '#e0743a', FALSE, 'active_days',  200,  84),
    ('hoarder',          'Hoarder',           '250 cards on your Looking-For list',    '🗃️', '#6b4f9a', FALSE, 'wishlist',     250,  92),
    ('social_butterfly', 'Social Butterfly',  'Made 30 friends at the Den',            '🦋', '#2f8f8f', FALSE, 'friends',      30,   102)
ON CONFLICT (slug) DO NOTHING;
