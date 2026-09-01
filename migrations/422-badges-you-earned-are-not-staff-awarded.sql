-- ── THE BOARD WAS CALLING EARNED BADGES "AWARDED BY STAFF" ───────────────────────────────────────────────────
-- ValkyrieSylve, in the plaza: "I dont have the deep delver badge even though I have definitely made it to 12
-- and out safely" ... "Says 'awarded by staff'."
--
-- She was reading the badge card, and the card was wrong. mkt_badge.admin_only is what BadgeCollectionClient
-- prints as "Awarded by staff" instead of "Locked" — and twenty-seven badges carry it that the GAME grants,
-- automatically, the moment you do the thing. Every mine badge, every forge badge, every dungeon badge. So the
-- one screen whose entire job is telling you what is left to earn was telling members that the whole of three
-- features was out of their hands.
--
-- Nothing about how they are granted changes. grantEventBadge is a plain insert with no gate, and grantBadge's
-- hand-assign guard tests auto_rule / gold_price / drop_only — never admin_only — so these stay assignable by
-- hand as well. This only stops the card lying about them.
UPDATE mkt_badge SET admin_only = FALSE WHERE slug IN (
    -- The mine: steps, seams, geodes, smelts, pours.
    'mine_deep', 'mine_deepwalker', 'mine_emberheart', 'mine_forgefed', 'mine_ladle', 'mine_masterhand',
    'mine_masterwork', 'mine_nerve', 'mine_notadrop', 'mine_poursteady', 'mine_tunnelrat',
    -- The forge: salvages, enhances, perfect strikes, +10, the perk tracks.
    'forge_artisan', 'forge_emberheart', 'forge_first', 'forge_grandmaster', 'forge_master', 'forge_pixel',
    'forge_plus10', 'forge_smith',
    -- The dungeons: bosses, floors, and the two you have to earn in the act.
    'delve_all_four', 'delve_bosses_25', 'delve_first_boss', 'delve_flawless', 'delve_floors_100',
    'delve_floors_500', 'delve_no_potion',
    -- Already has an auto_rule and is granted by the badge sweep, and still said staff-awarded.
    'mystery_big_hit'
);

-- ── AND THE PEOPLE WHO ALREADY DID IT: NOBODY, AS IT TURNS OUT ──────────────────────────────────────────────
-- A backfill was written to go with this, on the assumption that badges granted at the moment a counter crosses
-- its line would have missed everybody who was already past it. Dry-run against production over all thirteen
-- counter-based mine and dungeon badges, across 76 miners: it would have inserted ZERO rows. Every member past
-- a threshold already holds the badge for it, so the event grants have been firing correctly the whole time and
-- there is nothing owed. The backfill is not shipped, because a migration that does nothing still runs, still
-- has to be read by the next person, and still implies something was wrong here.
--
-- Which leaves the one badge that genuinely cannot be checked after the fact. mine_deep wants depth 12 in a
-- SINGLE descent and mine_nerve wants a dig at depth 10 or deeper; delve_flawless, delve_no_potion and
-- delve_all_four all want to know how one particular run went. None of that survives the end of the run, so a
-- member who did it before the grant was written has no record to award from. Those fire correctly from here.
