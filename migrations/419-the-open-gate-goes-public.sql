-- ── SEASON 1 OPENS (2026-08-31) ──────────────────────────────────────────────────────────────────────────────
-- The Long Road has been shut to the Den since 16 August, first for a gear rebalance and then because its gate
-- got tied to the season switch. Both are done, so the door opens and Season 1 — The Open Gate — starts with
-- it. Eight exclusive prizes every twenty-five rungs, and the rungs reset for everybody.
--
-- The reset is the part worth being careful about, and it is NOT done here. `rollRoadSeason` in arena.js rolls
-- one member at a time, the first time each of them opens the Arena, archiving their old climb into
-- mkt_arena_road_season as it goes. A bulk UPDATE would empty ninety sets in one statement with no transaction
-- to take it back with (neon() is the HTTP driver) — which is close to what went wrong on the 30th, when the
-- rollover fired for twenty members before the season was open at all.
--
-- No emoji: the modal takes the Roadside Cur's own portrait instead, which is one of the eight things being
-- announced.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href)
VALUES (
    'road_season_1_2026_08',
    'The Long Road is open, and it has a season',
    'The Road is walkable again, and it resets. Season 1 is The Open Gate: every rung you put down is yours for the season, and hanging off it are eight things that exist nowhere else in the Den — a decoration at 25, a recipe at 50, a piece of gear at 75, a pet at 100, and the same four again all the way to rung 200. They are season exclusive. When the season turns they go, and the next eight take their place. Your rungs reset with it, but nothing you won does, and the furthest rung you have ever stood on is kept forever. The fighters have been rebuilt too — every rung now fights as the thing it claims to be, and the climb gets genuinely harder the higher you go rather than easier. Nobody has walked past rung 100 yet.',
    NULL,
    'https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/pet/1788064487296-830859.webp',
    'Walk the Road',
    '/marketplace/arena'
)
ON CONFLICT (key) DO NOTHING;
