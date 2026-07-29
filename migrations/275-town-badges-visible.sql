-- Make the 19 Town/raid achievement badges VISIBLE (locked) in the badges page instead of fully hidden. They
-- were seeded secret=TRUE (absent from the board until earned); Luke wants them to show up as locked goals so
-- members can see what's there to chase. They stay EVENT badges (admin_only=FALSE, auto_rule=NULL) — granted
-- imperatively from gameplay — just no longer hidden.
UPDATE mkt_badge SET secret = FALSE WHERE slug IN (
    'town_raider','town_veteran','town_warlord','town_brawler','town_berserker','town_juggernaut',
    'golem_slayer','golem_bane','town_topdog','tavern_regular','dice_devil','dice_king',
    'town_patron','town_benefactor','well_wisher','fountain_faithful','high_stakes','merchant_jackpot','town_taskmaster'
);
