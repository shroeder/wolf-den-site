-- ── THE COLLECTION STILL FORGOT ANYTHING SOLD BACK TO THE SHOP ───────────────────────────────────────────────
-- Sunflower Jinxx, in the bug channel on 3 Sep: "I am currently missing the Bronze Breast Plate under Rare,
-- says you achieve it by reaching lvl 16, I'm a good bit past that."
--
-- She means the rare Breastplate, and she is right that something is wrong — but not the thing the screen told
-- her. She HELD it and sold it back on 3 August. Selling is meant to cost you the item, not the record of it:
-- the compendium's contract is that COLLECTED IS FOREVER — "sell it, salvage it, trade it away, lose it in a
-- wager, it still counts."
--
-- Migration 386 fixed exactly this hole and fixed it in two of the three places. It backfilled from
-- mkt_craft_event (the Forge) and mkt_auction (the seller's side), because both are proof of having held a
-- piece. The shop's own sell-back writes mkt_sold_item and was not in that pass, so anything sold to the
-- counter before the compendium shipped — or sold since, if the grant predated it — is still uncounted.
--
-- ⚠️ IT IS WORSE FOR A LEVEL ITEM THAN FOR ANY OTHER, WHICH IS WHY THIS SURFACED NOW. `source: 'level'` gear is
-- auto-granted by syncLevelItems, and that function skips anything in mkt_sold_item — deliberately, so sold
-- gear stays sold. So the Breastplate can never come back to her, and the compendium was showing it as
-- uncollected with "Level 16" underneath: a slot she cannot fill and an instruction she completed months ago.
-- getCompendium's own note draws that line — "an unlaunched item on a completion screen is a slot nobody can
-- ever fill... The denominator has to be a number you can actually reach."
--
-- Measured before writing: 73 rows across 17 members. Restoring them also pays the milestone stats those
-- items were always owed, exactly as 386 did.

INSERT INTO mkt_item_collected (buyer_id, item_id, first_at)
SELECT s.buyer_id, s.item_id, MIN(s.sold_at)
  FROM mkt_sold_item s
 WHERE s.item_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM mkt_buyer b WHERE b.id = s.buyer_id)
 GROUP BY s.buyer_id, s.item_id
ON CONFLICT (buyer_id, item_id) DO NOTHING;
