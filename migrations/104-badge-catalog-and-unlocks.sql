-- Grow the badge system into two tiers:
--   • Curated (admin_only) — roles & recognition only the owner/staff assign (event coordinator,
--     volunteer, judge, loyal customer, opening-day, etc.).
--   • Unlockable — auto-earned when a member crosses a real milestone (level, lifetime spend, event
--     check-ins, active days, tenure, wishlist size, friends, leaderboard #1, all-milestones).
-- The unlock rule lives on the badge row so the engine (src/lib/marketplace/badges.js) is data-driven.

ALTER TABLE mkt_badge ADD COLUMN IF NOT EXISTS auto_rule TEXT;       -- NULL = manual/curated; else a rule key
ALTER TABLE mkt_badge ADD COLUMN IF NOT EXISTS auto_threshold INT;   -- the number the metric must reach

-- Track who granted a badge: 'system' for auto-unlocks, an admin identifier for manual grants. Handy
-- for auditing and for never auto-revoking something an admin granted by hand.
ALTER TABLE mkt_user_badge ADD COLUMN IF NOT EXISTS awarded_by TEXT;

-- ---- Curated (admin-assigned) roles & recognition ----
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, sort_order) VALUES
    ('event_coordinator', 'Event Coordinator', 'Runs Wolf Den events',                 '🎪', '#7a5cff', TRUE, 4),
    ('volunteer',         'Volunteer',          'Lends a hand at the Den',              '🙌', '#2fa27a', TRUE, 5),
    ('judge',             'Judge / TO',         'Judges & organizes tournaments',       '🧑‍⚖️', '#4a90d9', TRUE, 6),
    ('loyal',             'Loyal Customer',     'A recognized regular of The Wolf Den', '💛', '#d9a441', TRUE, 20),
    ('helping_paw',       'Helping Paw',        'Goes out of their way to help others', '🤝', '#2fa27a', TRUE, 21),
    ('mvp',               'Community MVP',      'A standout member of the community',   '🏅', '#e0743a', TRUE, 22),
    ('opening_day',       'Opening Day',        'Here on The Wolf Den''s opening day',  '🚪', '#b0562f', TRUE, 30),
    ('first_week',        'First-Week Customer','Shopped in our very first week',       '🌅', '#c77d43', TRUE, 31),
    ('founding_member',   'Founding Member',    'An early supporter who helped build the Den', '🧱', '#9a6b3f', TRUE, 32)
ON CONFLICT (slug) DO NOTHING;

-- ---- Unlockable (auto-earned) milestones ----
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('night_hunter',  'Night Hunter',   'Reached Level 10',                         '🌙', '#3b5ba5', FALSE, 'level',          10,   50),
    ('alpha',         'Alpha',          'Reached Level 25',                         '👑', '#c8a24a', FALSE, 'level',          25,   51),
    ('ascended',      'Ascended',       'Reached Level 50',                         '💫', '#8e5cff', FALSE, 'level',          50,   52),
    ('big_spender',   'Big Spender',    'Spent $500 with The Wolf Den',             '💰', '#2f8f5b', FALSE, 'spend',          500,  60),
    ('whale',         'Whale',          'Spent $2,000 with The Wolf Den',           '🐋', '#2a6db0', FALSE, 'spend',          2000, 61),
    ('event_regular', 'Regular',        'Checked in at 10 events',                  '🎲', '#7a5cff', FALSE, 'events',         10,   70),
    ('event_grinder', 'Event Grinder',  'Checked in at 25 events',                  '🏆', '#c8a24a', FALSE, 'events',         25,   71),
    ('one_year',      'One Year Strong','A Wolf Den member for a whole year',       '📅', '#b0562f', FALSE, 'tenure_days',    365,  80),
    ('on_a_roll',     'On a Roll',      'Active on 30 different days',              '🔥', '#e0743a', FALSE, 'active_days',    30,   81),
    ('ever_present',  'Ever-Present',   'Active on 100 different days',             '🌗', '#6a7bb0', FALSE, 'active_days',    100,  82),
    ('collector',     'Collector',      '25 cards on your Looking-For list',        '📦', '#9a6b3f', FALSE, 'wishlist',       25,   90),
    ('curator',       'Curator',        '100 cards on your Looking-For list',       '🃏', '#6b4f9a', FALSE, 'wishlist',       100,  91),
    ('well_connected','Well Connected', 'Made 5 friends at the Den',                '👥', '#2f8f8f', FALSE, 'friends',        5,    100),
    ('pack_leader',   'Pack Leader',    'Made 15 friends at the Den',               '🐾', '#7a5cff', FALSE, 'friends',        15,   101),
    ('top_dog',       'Top Dog',        'Reached #1 on the leaderboard',            '🥇', '#d4af37', FALSE, 'leaderboard_top', 1,   110),
    ('well_rounded',  'Well Rounded',   'Completed every way to earn XP',           '🌟', '#c8a24a', FALSE, 'all_milestones', 1,    111)
ON CONFLICT (slug) DO NOTHING;
