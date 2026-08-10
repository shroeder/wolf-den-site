-- PETS GO TO SIX, AND CAN BE ENSHRINED (2026-08-10).
--
-- The answer to how people were actually playing: swapping pets all day to borrow each one's active ability for
-- the one thing it was good at. Not because swapping is fun — because not doing it was strictly worse.
--
-- `starts_at` defaults to NOW(), so anyone who joins after this never sees it. They will never have known a Den
-- where five was the end.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href)
VALUES (
    'pet_ascension_2026_08',
    'Your pets have a sixth level',
    'And the sixth one ends the swapping. Every pet''s signature ability only ever worked while that pet was out, so the best play was to equip the farm pet to harvest, the fishing pet to cast, the boss pet to strike, and back again — an errand you ran four times a day because not running it was worse.

Take ONE pet all the way to level six and you can ENSHRINE it. Its ability becomes permanent: it works whether that pet is equipped or not, forever. Put something else out; it keeps working.

Level six is a long road and it scales with rarity like every other level — and only your equipped pet earns, so the price of the climb is that you cannot be swapping while you make it. Nothing you have already earned changes: every badge and reward that counts a maxed pet still counts it.

Enshrining takes a LIGHTSTONE or a DARKSTONE, and that choice is permanent. The Lightstone keeps the ability exactly as it is and makes your whole pack brighter — every pet you own gives more of its passive. The Darkstone keeps the ability and raises it to 150%, the strongest a pet ability gets, and gives nothing to anybody else. Light is worth more the more pets you own; Dark is worth more the better the one ability is.

Stones turn up in a deep seam, on a dig, off a boss kill and in the dungeons. If the dice never land your way, the Quartermaster takes 900 doubloons and the Armoury takes 6,000 laurels for one.

And an enshrined pet does not look the way it used to. Every pet in the game has two new sixth-level forms — one for each stone — and it wears the one you chose from then on.',
    '✦',
    '/images/pets/stone-light.png',
    'Go and look at your pets',
    '/marketplace/pets'
)
ON CONFLICT (key) DO NOTHING;
