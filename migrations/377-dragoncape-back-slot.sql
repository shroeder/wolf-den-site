-- ── DRAGONCAPE MOVES OFF THE CHEST SLOT ──────────────────────────────────────────────────────────────────────
-- It was catalogued as a chest piece, which put TWO chest pieces in Dragonlord's Aspect (with Dragonplate) and
-- made the set's five-piece capstone impossible for anyone to wear, ever. The catalog now says `back`, which is
-- where every other cape, cloak and mantle in the game lives.
--
-- mkt_user_equipment is keyed (buyer_id, slot), so anybody wearing the cape has a row filed under `chest` that
-- no longer matches the item. Move it to `back` — but ONLY where that slot is empty.
--
-- WHY THE GUARD, AND WHY NOT FORCE IT. Two members have the cape on right now and BOTH already have something
-- on their back (wings_of_dawn, berserkers_hide). The three ways to force it all take something away to fix a
-- mistake that was ours: displacing the back piece swaps gear they chose, and unequipping the cape empties a
-- slot and quietly costs them 10 might / 20 ferocity. Leaving those rows alone costs nothing — stats are summed
-- by item_id so they still count, the equip screen renders by the row's own slot key so it still shows, and the
-- first time the member touches either slot it settles onto the right one. A misfiled row is a smaller problem
-- than reaching into somebody's loadout.
--
-- Nobody owns 3 or more of the five dragon pieces, so no completed set bonus was lost and none needs backfilling.
UPDATE mkt_user_equipment e
   SET slot = 'back'
 WHERE e.item_id = 'dragoncape'
   AND e.slot <> 'back'
   AND NOT EXISTS (
       SELECT 1
         FROM mkt_user_equipment b
        WHERE b.buyer_id = e.buyer_id
          AND b.slot = 'back'
   );
