-- THE SIXTH LEVEL WAS NEVER ANNOUNCED. Re-issuing it (2026-08-11).
--
-- Migration 357 carries this announcement and it has already been through the runner: it went out on a deploy
-- earlier than intended, the row it inserted was removed by hand the same night, and its NAME stayed in
-- `pgmigrations`. Rewriting 357's contents afterwards changed nothing — the runner skips a file whose name is
-- already in the ledger, so the rewritten body has never once been executed, and there has been no launch modal
-- for a feature that shipped and is live.
--
-- The lesson is the ledger's, not this file's: a migration is spent the first time it runs. Repairing one means
-- a NEW file, which is what this is.
INSERT INTO mkt_announcement (key, title, body, emoji, art_url, cta_label, cta_href, starts_at)
VALUES (
    'pet_ascension_2026_08',
    'Your pets have a sixth level',
    'Five is no longer the end of the road. There is one more rung above it, and it is a long one — it scales with rarity like every level before it, and only the pet you are carrying earns, so getting there means choosing one companion and sticking with it.

A pet that reaches level six can be ENSHRINED. Its signature ability becomes permanent: it keeps working whether that pet is equipped or not. Put something else out — the ability stays.

Enshrining takes a stone, and there are two.

The LIGHTSTONE keeps the ability exactly as it is and brightens your whole pack — every pet you own gives more of its passive. The DARKSTONE keeps the ability and sharpens it to 150%, the strongest a pet ability gets, and gives nothing to anyone else. Light is worth more the more pets you own. Dark is worth more the better the one ability is. The choice is permanent, so take your time over it.

Stones are rare. They turn up in a deep seam, buried on a dig, off a boss kill, and in the dungeons. If the dice never land your way, the Quartermaster will part with one for 4,000 doubloons and the Armoury for 7,500 laurels — about three weeks of saving either way.

And an enshrined pet does not look the way it used to. Every pet in the Den has two new sixth-level forms, one for each stone, and it wears the one you chose from that day on. Your farm, the plaza, the boss wall, your deck — everywhere anyone can see it.

Nothing you have already earned changes. Every badge and reward that counts a maxed pet still counts it.',
    '✦',
    '/images/pets/stone-light.png',
    'Go and look at your pets',
    '/marketplace/pets',
    NOW()
)
-- DO UPDATE rather than DO NOTHING, because the failure this repairs could have left a half-row behind: if the
-- deleted row had ever come back, DO NOTHING would silently decline to fix it and the modal would stay missing
-- for a second time, for a different reason.
ON CONFLICT (key) DO UPDATE
    SET title = EXCLUDED.title, body = EXCLUDED.body, emoji = EXCLUDED.emoji, art_url = EXCLUDED.art_url,
        cta_label = EXCLUDED.cta_label, cta_href = EXCLUDED.cta_href, starts_at = NOW(), active = TRUE;
