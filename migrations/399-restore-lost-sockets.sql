-- ── THE TWO CUTS A HAND-OFF DESTROYED ────────────────────────────────────────────────────────────────────────
-- ValkyrieSylve, in global chat: "I recieved the Dragon Shield in a trade yesterday, it was previously enhanced
-- and had a socket cut in it. Looking at it now, the enhancements are there but the socket is not."
--
-- She is right. reclaimGems() ran `DELETE FROM mkt_item_socket` on every disposal path, which is correct for a
-- piece that is being DESTROYED (salvaged, sold) and wrong for one that is changing hands. The stone came home
-- to the sender, as intended; the hole the Jewelcutter charged to cut went with it, which was never intended --
-- the Forge enhancement and the elemental reforge have always ridden across. Fixed in jeweller.js
-- (emptySockets / transferSockets); this restores the two pieces it already cost, which is all of them:
--
--   dragon_shield   SoullessShiitake -> ValkyrieSylve, traded 2026-08-22 (topaz_t2 reclaimed)
--   crown_of_kings  The Wolf Den -> Kimchi-Rips, sold at auction 2026-08-20 (topaz_t1 reclaimed)
--
-- Both are restored EMPTY. The gem is not owed -- it went back to the seller correctly and is theirs.
-- Guarded on still holding the item, and ON CONFLICT so a re-run cannot double-cut or overwrite a stone.
INSERT INTO mkt_item_socket (buyer_id, item_id, idx)
SELECT ui.buyer_id, ui.item_id, 0
  FROM mkt_user_item ui
 WHERE (ui.buyer_id, ui.item_id) IN (
        ('7aaeff8b-821c-4ba2-a467-f5509e94c45a'::uuid, 'dragon_shield'),
        ((SELECT id FROM mkt_buyer WHERE display_name = 'Kimchi-Rips' LIMIT 1), 'crown_of_kings')
       )
ON CONFLICT (buyer_id, item_id, idx) DO NOTHING;
