-- THE ARENA AND THE JEWELCUTTER GO PUBLIC (2026-08-10).
--
-- Both spent their build behind the owner allow-list. The Arena's ended up being the longer stretch, because
-- most of that time was spent taking things OUT: an invented "vigour" stat, a rung ladder, and two hidden dice
-- rolls that decided more of a fight than any decision you made in it.
--
-- ONE announcement for two features rather than two, because the system shows the newest unseen one only —
-- two would mean the second launch quietly buried the first.
--
-- `starts_at` defaults to NOW(), so anyone who joins after this moment never sees it: they have never known a
-- Den without either, and telling them a thing "just opened" is noise about the furniture.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href)
VALUES (
    'arena_jeweller_2026_08',
    'The Arena and the Jewelcutter are open',
    'Two doors at once. THE ARENA is a fight against another member''s loadout or an endless ladder of challengers, and it uses the gear you already built: your Might is your damage, your Crit Chance and Crit Power are the same ones the boss fight reads, and your Ferocity is what keeps you standing. Nothing is hidden and nothing is rolled except a critical — every number that decides the fight is printed on the two cards before you press anything, including exactly how much armour the other one is wearing. From round seven the pit closes and every blow lands harder, both ways, so no fight drags. Ten challenges a day, and losing costs nothing.

THE JEWELCUTTER cuts sockets into your gear and sets jewels in them. Five kinds, five tiers, and a sixth nobody has found yet. Jewels come out of the mine and out of the Armoury, and three of a tier fuse into one of the next — but past Polished the odds turn hard on purpose, so a Flawless is a story rather than a Tuesday. A set jewel shows on your gear everywhere, including on other people''s. You can pull one back out for a fee, and dismantling a piece never eats what was in it.',
    '⚔️',
    '/images/arena/npc/champion.webp',
    'Step into the ring',
    '/marketplace/arena'
)
ON CONFLICT (key) DO NOTHING;
