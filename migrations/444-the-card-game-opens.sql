-- ── THE CARD GAME OPENS (2026-09-11) ─────────────────────────────────────────────────────────────────────────
-- It ran as an owner prototype, then opened to the house and anybody holding the Tester role: 54 runs across
-- seven players, three acts walked, 1,285 the score to beat. Everything that gated it moves in this deploy and
-- it all moves together -- CARDS_UNLOCKED is "is anybody signed in" now, the card sharp sits at his table for
-- everyone rather than for the owner alone, and CARDS_PUBLIC puts the four ladder pets in the collection.
--
-- The fight also stopped being something the browser gets to report. The engine still runs there, because that
-- is what makes it quick to retune, but the server replays every claimed win through the same pure, seeded
-- engine and banks the health the replay ends on. See verifyWin and migration 443.
--
-- `starts_at` defaults to NOW(), so anybody who joins after tonight never sees this card -- they have never
-- known a tavern without him in it. `expires_at` NULL is a week, per migration 409.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href)
VALUES (
    'cards_open_2026_09',
    'There is a stranger in the tavern',
    'He is at the back table with a deck he never looks at, and he will deal you in. A run is fifteen rooms and then whatever is waiting at the end of them, and the only thing you carry between rooms is your health -- so a win at twelve is a problem you take with you.

YOUR DECK IS YOUR MENAGERIE. You are only ever offered a card if you own the animal behind it, which means no two people are handed the same run, and the shelf you have been filling for a year is the thing you play with. Every card you take makes the deck bigger and the draw thinner, so taking one is a bet, not a reward.

There is a ladder underneath it. Every run scores, the score is lifetime, and crossing a rung opens new cards and new trinkets -- and at ranks three, five, ten and fifteen it hands over an animal that exists nowhere else in the Den and cannot fall out of any chest. The pets whose cards you played grow too: a run feeds the ones that wrote the deck.

Thirteen runs have walked out of the third act alive. The best of them scored 1,285. There is a fourth act behind a door that takes three keys to open, and it is not on the map until you are carrying all of them.',
    '🃏',
    '/images/cards/chrome/card-back.png',
    'Sit down',
    '/marketplace/cards'
)
ON CONFLICT (key) DO NOTHING;
