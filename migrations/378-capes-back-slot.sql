-- ── THE OTHER TWO CAPES MOVE OFF THE CHEST SLOT ──────────────────────────────────────────────────────────────
-- Found while fixing the Dragoncape (migration 377): `war_cape` and `gs_traveler_cloak` were catalogued as
-- chest pieces too. Neither is in a set, so unlike the Dragoncape neither made a bonus unreachable — but a
-- "War Cape" competing with breastplates while every other cape, cloak and mantle sits on `back` is the
-- catalog contradicting itself, and it costs whoever wears one a whole slot they should still have.
--
-- Exactly the rule 377 used, and for the same reason: move the equipped row to `back` ONLY where that slot is
-- free. One member is wearing the War Cape; nobody is wearing the Traveler's Cloak. Where the back slot is
-- already occupied the row stays where it is — stats sum by item_id so it still counts, the equip screen
-- renders by the row's own slot key so it still shows, and it settles the moment the member touches either
-- slot. Reaching into somebody's loadout to tidy our own data is worse than the untidiness.
UPDATE mkt_user_equipment e
   SET slot = 'back'
 WHERE e.item_id IN ('war_cape', 'gs_traveler_cloak')
   AND e.slot <> 'back'
   AND NOT EXISTS (
       SELECT 1
         FROM mkt_user_equipment b
        WHERE b.buyer_id = e.buyer_id
          AND b.slot = 'back'
   );
