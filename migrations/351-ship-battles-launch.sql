-- SHIP BATTLES GO PUBLIC (2026-08-09).
--
-- Raiding spent its rebuild behind the dev allow-list — every door of it, from the CTA to the quest tasks —
-- while it turned from captain-vs-captain into ship-vs-ship. The gate came off today, and the Den's members do
-- not read release notes, they open the app. So they get told the next time they do.
--
-- `starts_at` defaults to NOW(), which means anyone who joins after this moment never sees it: they have never
-- known a Den without ship battles, and telling them a thing "just opened" is noise about the furniture.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href)
VALUES (
    'ship_battles_2026_08',
    'Ship battles are open',
    'Your boat has guns now. Find a fight and you are matched against someone your own size — a pirate off the fleet or another captain from the Den — and the two ships trade broadsides until one of them goes down. Tap the part of her you want hit: shred the sails, hole the hull, or knock out a cannon before it can answer. Cannons, Gunnery and Hull are yours to upgrade, and a won fight is the only thing in the game that pays doubloons — which is the only thing the Quartermaster takes. Five battles a day. Losing costs the battle and nothing else.',
    '🏴‍☠️',
    '/images/fleet/fleet_boss_revenge.png',
    'Beat to quarters',
    '/marketplace/sailing'
)
ON CONFLICT (key) DO NOTHING;
