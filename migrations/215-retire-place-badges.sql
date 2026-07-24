-- Retire the 1st/2nd/3rd-place leaderboard badges. They carried the top sort_order, so they kept hijacking
-- members' chosen showcase badge. Top-damage recognition now lives on the boss "Hall of Heroes" as live rank
-- medals (UI only), not badges.
DELETE FROM mkt_user_badge WHERE badge_slug IN ('place_1', 'place_2', 'place_3');
DELETE FROM mkt_badge WHERE slug IN ('place_1', 'place_2', 'place_3');
