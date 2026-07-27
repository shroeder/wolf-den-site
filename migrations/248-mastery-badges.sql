-- Mastery badges: earn one for maxing out ANY single upgrade track in a feature, and a grander one for
-- maxing out EVERY track in that feature. Granted imperatively (grantEventBadge) from each buyUpgrade path,
-- so they carry no auto_rule and are SECRET until earned (like the sailing/merchant/forge achievement badges).
-- High sort_order so they never hijack a member's chosen showcase. Emoji for now; AI die-cut sprites can be
-- generated via the badge-sprite admin flow afterward.

-- Sailing (public feature) — 5 boat tracks + 5 digging tracks.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('sail_shipwright', 'Master Shipwright',    'Maxed out one of your ship or digging upgrade tracks.',            '🔩', '#8fd8ff', FALSE, NULL, NULL, TRUE, 150),
    ('sail_sovereign',  'Sovereign of the Seas','Maxed out every ship AND digging upgrade — a complete fleet.',     '🔱', '#ffd75e', FALSE, NULL, NULL, TRUE, 151)
ON CONFLICT (slug) DO NOTHING;

-- Farming (public feature) — the six farm upgrade tracks.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('farm_cultivator', 'Master Cultivator',    'Maxed out one of your farm upgrades.',                             '🌿', '#7ed57e', FALSE, NULL, NULL, TRUE, 250),
    ('farm_steward',    'Steward of the Land',  'Maxed out every single farm upgrade.',                             '🌾', '#ffd75e', FALSE, NULL, NULL, TRUE, 251)
ON CONFLICT (slug) DO NOTHING;

-- The Forge (owner-gated) — the four smithing perks. Secret + drop_only, matching the other forge badges.
INSERT INTO mkt_badge (slug, label, description, icon, color, secret, drop_only, sort_order) VALUES
    ('forge_artisan',     'Master Artisan',     'Maxed out one of the Forge''s smithing perks.',                   '🧰', '#ff9a3c', true, true, 906),
    ('forge_grandmaster', 'Forge Grandmaster',  'Maxed out every one of the Forge''s smithing perks.',             '🏆', '#ffd75e', true, true, 907)
ON CONFLICT (slug) DO NOTHING;

-- ── Backfill ── grant to members who ALREADY qualify (they can't re-buy a maxed track to trigger the
-- event-grant, so retro-award them here). No XP/gold reward on backfill — just the recognition.

-- Sailing: boat maxes are 20 each; dig maxes are stamina 10, others 5.
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
    SELECT buyer_id, 'sail_shipwright', 'system' FROM mkt_sailing
     WHERE COALESCE(speed_level,0) >= 20 OR COALESCE(luck_level,0) >= 20 OR COALESCE(rarity_level,0) >= 20
        OR COALESCE(find_level,0) >= 20 OR COALESCE(raid_level,0) >= 20
        OR COALESCE(dig_stamina_level,0) >= 10 OR COALESCE(dig_pierce_level,0) >= 5 OR COALESCE(dig_strike_level,0) >= 5
        OR COALESCE(dig_efficient_level,0) >= 5 OR COALESCE(dig_detonator_level,0) >= 5
ON CONFLICT DO NOTHING;

INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
    SELECT buyer_id, 'sail_sovereign', 'system' FROM mkt_sailing
     WHERE COALESCE(speed_level,0) >= 20 AND COALESCE(luck_level,0) >= 20 AND COALESCE(rarity_level,0) >= 20
       AND COALESCE(find_level,0) >= 20 AND COALESCE(raid_level,0) >= 20
       AND COALESCE(dig_stamina_level,0) >= 10 AND COALESCE(dig_pierce_level,0) >= 5 AND COALESCE(dig_strike_level,0) >= 5
       AND COALESCE(dig_efficient_level,0) >= 5 AND COALESCE(dig_detonator_level,0) >= 5
ON CONFLICT DO NOTHING;

-- Farming: all six tracks max at 5.
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
    SELECT id, 'farm_cultivator', 'system' FROM mkt_buyer
     WHERE COALESCE((farm_upgrades->>'plots')::int,0) >= 5 OR COALESCE((farm_upgrades->>'grow')::int,0) >= 5
        OR COALESCE((farm_upgrades->>'seedluck')::int,0) >= 5 OR COALESCE((farm_upgrades->>'petcap')::int,0) >= 5
        OR COALESCE((farm_upgrades->>'chest')::int,0) >= 5 OR COALESCE((farm_upgrades->>'seedsaver')::int,0) >= 5
ON CONFLICT DO NOTHING;

INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
    SELECT id, 'farm_steward', 'system' FROM mkt_buyer
     WHERE COALESCE((farm_upgrades->>'plots')::int,0) >= 5 AND COALESCE((farm_upgrades->>'grow')::int,0) >= 5
       AND COALESCE((farm_upgrades->>'seedluck')::int,0) >= 5 AND COALESCE((farm_upgrades->>'petcap')::int,0) >= 5
       AND COALESCE((farm_upgrades->>'chest')::int,0) >= 5 AND COALESCE((farm_upgrades->>'seedsaver')::int,0) >= 5
ON CONFLICT DO NOTHING;

-- Forge: all four perks max at 5.
INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
    SELECT DISTINCT buyer_id, 'forge_artisan', 'system' FROM mkt_forge_upgrade WHERE level >= 5
ON CONFLICT DO NOTHING;

INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by)
    SELECT buyer_id, 'forge_grandmaster', 'system' FROM mkt_forge_upgrade
     WHERE key IN ('efficient','keen_eye','masters_touch','steady_hand') AND level >= 5
     GROUP BY buyer_id HAVING COUNT(DISTINCT key) = 4
ON CONFLICT DO NOTHING;
