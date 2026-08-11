-- THE STONES ARE PER PET NOW, AND THE ANNOUNCEMENT SAID OTHERWISE.
--
-- Migration 361 put the sixth-level announcement up last night describing the Lightstone as "brightens your
-- whole pack — every pet you own gives more of its passive" and the Darkstone as "sharpens it to 150%". Both
-- sentences are now false: the pack aura is deleted and what a stone does is authored per pet.
--
-- Two members have already seen that card. Everyone else who opens the game gets the corrected one, and the
-- `starts_at` is deliberately NOT reset — the announcement is still the same launch, it is just described
-- correctly. Bumping it would re-show it to the two who read the old copy, which is the right outcome here.
UPDATE mkt_announcement
   SET body = 'Five is no longer the end of the road. There is one more rung above it, and it is a long one — it scales with rarity like every level before it, and only the pet you are carrying earns, so getting there means choosing one companion and sticking with it.

A pet that reaches level six can be ENSHRINED. Its signature ability becomes permanent: it keeps working whether that pet is equipped or not. Put something else out — the ability stays.

Enshrining takes a stone, and there are two: the LIGHTSTONE and the DARKSTONE. Both keep the ability forever. What each one does on top of that is different on every single pet, and it is written on the pet.

Some pets are sharpest when a stone doubles down on what they already do. Others get more interesting when a stone teaches them a second trade — a fox that learns to raid chests, an owl that keeps watch after closing, a crocodile that learns to finish. Neither stone is the better one, and neither is reliably the wider or the harder of the two. Open the pet and both choices are drawn side by side, at their real numbers, before you commit. The choice is permanent, so take your time over it.

Stones are rare. They turn up in a deep seam, buried on a dig, off a boss kill, and in the dungeons. If the dice never land your way, the Quartermaster will part with one for 4,000 doubloons and the Armoury for 7,500 laurels — about three weeks of saving either way.

And an enshrined pet does not look the way it used to. Every pet in the Den has two new sixth-level forms, one for each stone, and it wears the one you chose from that day on. Your farm, the plaza, the boss wall, your deck — everywhere anyone can see it.

Nothing you have already earned changes. Every badge and reward that counts a maxed pet still counts it.'
 WHERE key = 'pet_ascension_2026_08';

-- The two members who read the old copy get it once more, because what they read is no longer how the game
-- works and a permanent, irreversible choice is the wrong thing to leave somebody mis-briefed about.
DELETE FROM mkt_announcement_seen WHERE key = 'pet_ascension_2026_08';
