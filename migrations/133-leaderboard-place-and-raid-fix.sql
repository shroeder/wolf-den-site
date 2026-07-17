-- (1) Raid Veteran was universal: bosses_fought counted PASSIVE auto-attacks (everyone gets them). The
--     metric now counts only bosses where a member landed a MANUAL strike (see badges.js). Bump the
--     veteran bar to 3 raids and reconcile existing grants against the new manual metric.
UPDATE mkt_badge SET auto_threshold = 3 WHERE slug = 'boss_veteran';

-- Distinct bosses each member actually manual-struck.
-- Revoke raid badges from members who no longer meet the manual thresholds...
DELETE FROM mkt_user_badge ub
 WHERE ub.badge_slug = 'boss_veteran'
   AND COALESCE((SELECT COUNT(DISTINCT boss_id) FROM boss_hit WHERE buyer_id = ub.buyer_id AND kind = 'manual'), 0) < 3;
DELETE FROM mkt_user_badge ub
 WHERE ub.badge_slug = 'boss_warlord'
   AND COALESCE((SELECT COUNT(DISTINCT boss_id) FROM boss_hit WHERE buyer_id = ub.buyer_id AND kind = 'manual'), 0) < 5;
DELETE FROM mkt_user_badge ub
 WHERE ub.badge_slug = 'boss_legend'
   AND COALESCE((SELECT COUNT(DISTINCT boss_id) FROM boss_hit WHERE buyer_id = ub.buyer_id AND kind = 'manual'), 0) < 15;

-- ...and grant to those who do qualify under the new metric.
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
SELECT buyer_id, 'boss_veteran', 'system' FROM (
    SELECT buyer_id, COUNT(DISTINCT boss_id) AS n FROM boss_hit WHERE kind = 'manual' GROUP BY buyer_id
) q WHERE q.n >= 3 ON CONFLICT DO NOTHING;
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
SELECT buyer_id, 'boss_warlord', 'system' FROM (
    SELECT buyer_id, COUNT(DISTINCT boss_id) AS n FROM boss_hit WHERE kind = 'manual' GROUP BY buyer_id
) q WHERE q.n >= 5 ON CONFLICT DO NOTHING;
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
SELECT buyer_id, 'boss_legend', 'system' FROM (
    SELECT buyer_id, COUNT(DISTINCT boss_id) AS n FROM boss_hit WHERE kind = 'manual' GROUP BY buyer_id
) q WHERE q.n >= 15 ON CONFLICT DO NOTHING;

-- (2) "Top Dog" was a PERSISTENT badge (granted at #1, never revoked). Replace it with live 1st/2nd/3rd
--     place badges that a cron keeps in sync with the current leaderboard. Remove Top Dog (its grants
--     cascade-delete).
DELETE FROM mkt_badge WHERE slug = 'top_dog';

-- Place badges: admin_only + no auto_rule → managed exclusively by syncLeaderboardBadges (grant/revoke).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, sort_order) VALUES
    ('place_1', '1st Place', 'Currently #1 on the leaderboard',  '🥇', '#ffd75e', TRUE, 1),
    ('place_2', '2nd Place', 'Currently #2 on the leaderboard',  '🥈', '#cfd4dc', TRUE, 2),
    ('place_3', '3rd Place', 'Currently #3 on the leaderboard',  '🥉', '#cd7f32', TRUE, 3)
ON CONFLICT (slug) DO NOTHING;

-- Seed the current top 3 (the cron takes over from here).
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
SELECT id, 'place_' || rnk, 'system' FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(xp, 0) DESC, created_at ASC) AS rnk
      FROM mkt_buyer WHERE alias IS NOT NULL AND COALESCE(xp, 0) > 0
) r WHERE r.rnk <= 3 ON CONFLICT DO NOTHING;
