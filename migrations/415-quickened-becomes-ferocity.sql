-- ── THE QUICKENED STAT IS GONE; ITS POINTS BECOME FEROCITY ───────────────────────────────────────────────────
-- `doublestrike` was named for a mechanic that no longer exists -- nothing swings twice; blowCount was deleted
-- and a blow is one blow unless a skill sets `hits`. What the points actually bought was TEMPO, through a
-- second conversion in kitFor, which is the same thing Ferocity buys through a shorter one.
--
-- Luke: "I feel like we should try to get rid of double strike entirely even under the hood. That way the
-- calculation gets a little bit simpler. And wherever we hand out double strike, we would just convert that to
-- ferocity as a stat."
--
-- The item catalogue converts in code (see RETIRED_AFFIX in items.js) because its affixes are DERIVED from the
-- item id rather than stored. The only doublestrike anywhere in the database is a FORGED one: mkt_item_enhance
-- holds a stat_bonus JSONB per owned piece, and the Forge could roll this stat into a socket.
--
-- Measured against production before writing this: 3 rows of 306.
--
-- ONE FOR ONE, not at the tempo-equivalent rate. A doublestrike point was worth 0.005 x 0.45 = 0.00225 of
-- tempo and a ferocity point is worth 0.01, so parity would be 0.225 ferocity per point -- which rounds three
-- members' forge work to nothing. The stat was also inverted against its own rarity: it drew as a PRIZE affix
-- (weight 7, level with Riposte) while paying about a ninth of what ordinary Ferocity pays, so 1:1 corrects
-- that rather than granting anything unearned. The largest single holding is small either way.
--
-- Additive, because a piece may already carry forged ferocity and the two must not overwrite each other.
UPDATE mkt_item_enhance
   SET stat_bonus = (stat_bonus - 'doublestrike')
                    || jsonb_build_object(
                           'ferocity',
                           COALESCE((stat_bonus ->> 'ferocity')::numeric, 0)
                         + COALESCE((stat_bonus ->> 'doublestrike')::numeric, 0)
                       ),
       updated_at = NOW()
 WHERE stat_bonus ? 'doublestrike';

-- The other place a member could have named it is their stat-priority list, which is not stored server-side:
-- EquipmentClient filters what it loads through PRIORITY_STATS, so dropping the entry cleans those on the next
-- read with nothing to migrate.
