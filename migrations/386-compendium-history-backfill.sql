-- ── THE COLLECTION FORGOT EVERYTHING ANYONE SALVAGED BEFORE IT EXISTED ───────────────────────────────────────
-- SoullessShiitake, in global chat on 13 Aug: "And dude! Same with the compendium!! I feel like a dork for
-- immediately salvaging everything now."
--
-- He is describing a real hole, not a worry. The compendium's contract is that COLLECTED IS FOREVER — "sell it,
-- salvage it, trade it away, lose it in a wager, it still counts" — but it only started recording when it
-- shipped (migration 366), and its launch backfill read mkt_user_item, which is a LIVE bag. Anything anyone had
-- already melted down was therefore uncounted, and the Forge opened three weeks before the compendium did. So
-- the people who used the Forge most are missing the most, which is the exact opposite of what a collection is
-- supposed to reward. He is not a dork; the table just was not listening yet.
--
-- Nothing has to be guessed. The Forge writes an event per action with the item's id, going back to 26 July —
-- 4,375 salvages — and you cannot salvage, enhance or refund a piece you do not own. The auction knows who
-- listed what for the same reason. Both are proof of having held it, which is the only question this table asks.
--
-- Measured before writing: 93 items missing for Alstier1, 48 for Eric D, 46 for YoshiHwan, 22 for
-- SoullessShiitake himself. Restoring them also pays the milestone stats those items were always owed.

-- 1. EVERY PIECE THE FORGE HAS EVER SEEN. salvage, enhance and collection_refund all carry the item id.
INSERT INTO mkt_item_collected (buyer_id, item_id, first_at)
SELECT e.buyer_id, e.item_id, MIN(e.created_at)
  FROM mkt_craft_event e
 WHERE e.item_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM mkt_buyer b WHERE b.id = e.buyer_id)
 GROUP BY e.buyer_id, e.item_id
ON CONFLICT (buyer_id, item_id) DO NOTHING;

-- 2. AND EVERY PIECE ANYONE PUT UP AT AUCTION. The buyer's side already settles through grantItem and was
--    always counted; the SELLER's side is the one that could be sold off before the compendium was watching.
INSERT INTO mkt_item_collected (buyer_id, item_id, first_at)
SELECT a.seller_id, a.item_id, MIN(a.listed_at)
  FROM mkt_auction a
 WHERE a.item_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM mkt_buyer b WHERE b.id = a.seller_id)
 GROUP BY a.seller_id, a.item_id
ON CONFLICT (buyer_id, item_id) DO NOTHING;
