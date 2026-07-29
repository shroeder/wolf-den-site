-- Auction escrow reconciliation: an item you have actively LISTED must not also sit in your inventory.
-- Previously, listing a level-source item deleted the inventory row but syncLevelItems auto-re-granted it, so the
-- piece could appear in the bag AND on the auction at once. Remove the inventory copy of anything actively listed.
DELETE FROM mkt_user_item ui
USING mkt_auction a
WHERE a.status = 'active' AND a.seller_id = ui.buyer_id AND a.item_id = ui.item_id;
