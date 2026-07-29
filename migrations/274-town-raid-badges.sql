-- 19 hard-to-earn SECRET achievement badges spanning every Wolf Den Town system (live raids, the Golem boss,
-- the tavern, civic Town Development, the Wishing Well, the Traveling Merchant, daily Town quests). All are
-- EVENT badges: admin_only = FALSE (earnable, not hand-assigned) + secret = TRUE (hidden until earned) +
-- auto_rule = NULL (granted imperatively from gameplay via grantEventBadge in town-badges.js). High sort_order
-- keeps them out of a member's default showcase until earned.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order) VALUES
    -- Raids
    ('town_raider',      'Town Raider',      'Fought in 5 Wolf Den Town raids.',                 '🏘️', '#ff8a4c', FALSE, TRUE, NULL, NULL, 700),
    ('town_veteran',     'Raid Veteran',     'Fought in 25 Town raids.',                          '🎖️', '#ff8a4c', FALSE, TRUE, NULL, NULL, 701),
    ('town_warlord',     'Town Warlord',     'Fought in 75 Town raids.',                          '🩸', '#e0433f', FALSE, TRUE, NULL, NULL, 702),
    ('town_brawler',     'Brawler',          'Landed 100 blows across Town raids.',               '👊', '#ff8a4c', FALSE, TRUE, NULL, NULL, 703),
    ('town_berserker',   'Berserker',        'Landed 500 blows across Town raids.',               '🪓', '#e0433f', FALSE, TRUE, NULL, NULL, 704),
    ('town_juggernaut',  'Juggernaut',       'Dealt 100,000 total damage in Town raids.',         '💥', '#ffb52e', FALSE, TRUE, NULL, NULL, 705),
    ('golem_slayer',     'Golem Slayer',     'Helped the pack fell the Treasure Golem boss.',     '💎', '#37f5c0', FALSE, TRUE, NULL, NULL, 706),
    ('golem_bane',       'Bane of the Golem','Felled the Treasure Golem 5 times.',                '☄️', '#37f5c0', FALSE, TRUE, NULL, NULL, 707),
    ('town_topdog',      'Top Dog',          'Topped the damage board on a Golem boss kill.',     '👑', '#ffd75e', FALSE, TRUE, NULL, NULL, 708),
    -- Tavern
    ('tavern_regular',   'Tavern Regular',   'Downed 30 pints at the Wolf Den tavern.',           '🍺', '#c9922e', FALSE, TRUE, NULL, NULL, 709),
    ('dice_devil',       'Dice Devil',       'Played 100 hands of tavern dice.',                  '🎲', '#b878ff', FALSE, TRUE, NULL, NULL, 710),
    ('dice_king',        'Dice King',        'Played 500 hands of tavern dice.',                  '🎰', '#b878ff', FALSE, TRUE, NULL, NULL, 711),
    -- Civic / Town Development
    ('town_patron',      'Town Patron',      'Gave 10,000 gold to Town Development.',             '🏛️', '#7fd8ff', FALSE, TRUE, NULL, NULL, 712),
    ('town_benefactor',  'Town Benefactor',  'Gave 100,000 gold to Town Development.',            '🏆', '#ffd75e', FALSE, TRUE, NULL, NULL, 713),
    -- Wishing Well
    ('well_wisher',      'Well Wisher',      'Claimed the Wishing Well on 25 days.',              '🪙', '#7fd8ff', FALSE, TRUE, NULL, NULL, 714),
    ('fountain_faithful','Fountain Faithful','Claimed the Wishing Well on 100 days.',             '⛲', '#7fd8ff', FALSE, TRUE, NULL, NULL, 715),
    -- Traveling Merchant
    ('high_stakes',      'High Stakes',      'Gambled the Traveling Merchant 50 times.',          '🃏', '#ff8a4c', FALSE, TRUE, NULL, NULL, 716),
    ('merchant_jackpot', 'Merchant Jackpot', 'Won a Legendary from the Traveling Merchant gamble.','🎁', '#ffb52e', FALSE, TRUE, NULL, NULL, 717),
    -- Daily Town quests
    ('town_taskmaster',  'Taskmaster',       'Claimed 50 daily Town quests.',                     '📜', '#8fe39a', FALSE, TRUE, NULL, NULL, 718)
ON CONFLICT (slug) DO NOTHING;
