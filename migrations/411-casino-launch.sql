-- ── THE CASINO GOES PUBLIC (2026-08-26) ──────────────────────────────────────────────────────────────────────
-- The floor spent its whole build behind the owner allow-list: hidden from the street in GATED_BUILDINGS, and
-- refused on the server by every verb of its own API. Both are gone in this deploy, together, because a page
-- that renders for everybody in front of an endpoint that answers nobody is a room full of buttons that refuse.
--
-- What did NOT open with it: the owner's force-a-bonus controls on the cabinets, which are checked against the
-- buyer id inside spinSlot5 rather than trusted from the request body; and the rope at the back, which reads
-- the VIP role or a pass bought at the Counter. A rope INSIDE a public room is not a second gate on the street.
--
-- `starts_at` defaults to NOW(), so anybody who joins after this moment never sees the card -- they have never
-- known a town without the room. `expires_at` is left NULL, which migration 409 defines as a week: after that
-- this stops being news and a returning member finds the door the way they find every other one.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href)
VALUES (
    'casino_open_2026_08',
    'The Casino is open',
    'A room off the town square with five machines in it, and every one of them is a different game underneath. THE HUNT runs a warren beneath the reels. THE HARVEST makes you build the round before it will pay. THE DEEP keeps every kraken it lands and adds a haul for every pearl. THE MENAGERIE turns the whole board into one giant animal. THE VAULT falls in on itself and pays again on the way down, and it keeps a gem room nobody has emptied yet. Away from the reels there is a blackjack table, a keno board and a bingo card, and every paytable in the house says what it pays before you stake a thing -- three-to-two is three-to-two, and five of five on a ticket is five of five.

What you stake comes back as CHIPS. Not what you win -- what you STAKE, so an unlucky hour is still an hour that bought something. The Counter at the back is the only place a chip is worth anything, and it is worth quite a lot there: chests up to Primordial, five pets that live nowhere else in the Den, and a few things that change how the floor treats you afterwards. Eight badges hang on this floor and half of them are secret.

There is also a rope at the back of the room, and a wolf standing in front of it who will tell you exactly what it takes to get past him.',
    '🎰',
    '/images/casino/icon.webp',
    'Walk in',
    '/marketplace/casino'
)
ON CONFLICT (key) DO NOTHING;
