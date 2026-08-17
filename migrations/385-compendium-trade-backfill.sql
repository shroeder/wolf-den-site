-- ── THE GEAR PEOPLE TRADED FOR WAS NEVER COLLECTED ───────────────────────────────────────────────────────────
-- ValkyrieSylve, in global chat: "The compendium doesnt appear to be adding gear you obtain via trades that you
-- didnt previously own. 2-3 items are not showing up for me that I recieved from trades."
--
-- She is right, and it is exact. The compendium documents ONE write point — `markCollected`, called from
-- `grantItem`, "the single door every acquisition already goes through". A trade is the door it does not go
-- through: `moveItem` cannot call grantItem, because grantItem starts an item's charges fresh and carrying the
-- sender's charge state across is the entire job. So it wrote the bag row by hand, and the collection never
-- heard about it. The auction settles through grantItem and was never affected.
--
-- Measured before writing this: 11 (member, item) pairs sat in bags with no collected row, and ALL 11 arrived
-- by trade. The code fix closes the door; this repairs what already came through it.

-- 1. EVERYTHING ANYONE IS HOLDING. Same insert migration 366 used at launch, for the same reason — a piece in
--    your bag was obviously collected. Idempotent, so it costs nothing where the row already exists.
INSERT INTO mkt_item_collected (buyer_id, item_id, first_at)
SELECT ui.buyer_id, ui.item_id, COALESCE(MIN(ui.acquired_at), NOW())
  FROM mkt_user_item ui
 WHERE ui.item_id IS NOT NULL
 GROUP BY ui.buyer_id, ui.item_id
ON CONFLICT (buyer_id, item_id) DO NOTHING;

-- 2. AND EVERYTHING ANYONE EVER TRADED FOR, held or not. Collected is FOREVER — sell it, salvage it, trade it
--    on, it still counts — so recovering only what is still in the bag would quietly under-credit anybody who
--    traded for a piece and then used it. The offer rows are a complete record of who received what: the
--    offered items went to `to_buyer_id`, the requested items came back to `from_buyer_id`.
INSERT INTO mkt_item_collected (buyer_id, item_id, first_at)
SELECT r.buyer_id, r.item_id, MIN(r.at)
  FROM (
      SELECT o.to_buyer_id AS buyer_id, i AS item_id, COALESCE(o.resolved_at, NOW()) AS at
        FROM mkt_trade_offer o, LATERAL jsonb_array_elements_text(o.offered_items) AS i
       WHERE o.status = 'accepted'
      UNION ALL
      SELECT o.from_buyer_id AS buyer_id, i AS item_id, COALESCE(o.resolved_at, NOW()) AS at
        FROM mkt_trade_offer o, LATERAL jsonb_array_elements_text(o.requested_items) AS i
       WHERE o.status = 'accepted'
  ) r
 -- A buyer who has since been deleted would fail the foreign key rather than be skipped.
 WHERE EXISTS (SELECT 1 FROM mkt_buyer b WHERE b.id = r.buyer_id)
 GROUP BY r.buyer_id, r.item_id
ON CONFLICT (buyer_id, item_id) DO NOTHING;
