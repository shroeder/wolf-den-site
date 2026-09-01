-- ── THREE BADGES THAT OUTLIVED THE MECHANIC THEY DESCRIBED ───────────────────────────────────────────────────
-- dig_excavator, dig_goldtouch and raid_plunderer were the only three badges in the game that NOTHING granted.
-- Not a missing call — a missing MECHANIC. All three were written for the old model, where a dig paid fragments
-- and ten of a tier fused into that tier's chest on a second screen. When that was replaced by "uncover the
-- chest and it IS yours", the thing their descriptions named stopped existing, and they were left as trophies
-- with holders and no route: 1, 6 and 5 members holding badges nobody could ever earn again.
--
-- Luke: "for the 3 that dont apply. rework to be find chest centric."
--
-- So they follow the chest. Their labels survive the move without straining — you still excavate, the touch is
-- still golden, and a mythic chest out of the sand is still plunder — and the grants now live in the dig that
-- replaced the forge (sailing.js, beside dig_cleansweep). These are the descriptions to match.
--
-- NOT RENAMED and NOT DELETED. Members hold them: a delete takes a badge off somebody who earned it under the
-- old rules, and a rename makes the badge on their profile a different badge than the one they were given.
UPDATE mkt_badge SET description = 'Dug up 50 treasure chests.'
 WHERE slug = 'dig_excavator';
UPDATE mkt_badge SET description = 'Dug up a gold-tier treasure chest or better.'
 WHERE slug = 'dig_goldtouch';
UPDATE mkt_badge SET description = 'Pulled a mythic chest out of the sand.'
 WHERE slug = 'raid_plunderer';

-- And the same correction as migration 422: all three are earned by playing, so the card must not go on
-- calling them staff-awarded. (These three were already admin_only = FALSE; this is belt and braces for
-- raid_plunderer, which sits in the sailing badge block rather than the curated one.)
UPDATE mkt_badge SET admin_only = FALSE
 WHERE slug IN ('dig_excavator', 'dig_goldtouch', 'raid_plunderer');

-- ── AND THE PEOPLE WHO HAVE ALREADY DUG FIFTY ────────────────────────────────────────────────────────────────
-- Unlike migration 422's backfill, this one is NOT a no-op — but it is deliberately empty, because the counter
-- it reads has never been written. mkt_sailing.chests_forged was incremented by the fuse-ten-fragments screen
-- and by nothing at all after that screen was removed, so it is 0 for every one of the 76 diggers on the site
-- and 50 dug chests is not recorded anywhere else. The count starts from the next dig, for everybody.
--
-- That same dead column is why the Trophy Room's "Chests forged" record read zero for the whole Den. It is
-- written again from this deploy, counting chests FOUND, which is what the wall was always trying to say.
