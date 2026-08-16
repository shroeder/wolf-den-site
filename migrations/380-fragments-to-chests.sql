-- ── CHEST FRAGMENTS ARE GONE. PAY EVERYONE OUT. ──────────────────────────────────────────────────────────────
-- You dig up a CHEST now, at the tier that was buried, and chests come from digging and nowhere else. The
-- shard-and-forge model is deleted: no more hauling 2-3 fragments, hoarding ten of a tier, and assembling the
-- chest on a different screen two days later.
--
-- 46 members are holding 559 shards between them at the moment this runs. Deleting the column under them would
-- be taking something they earned, so this converts the hold at EXACTLY the rate it was worth:
--
--   * every 10 shards of a tier  -> 1 chest of that tier   (the forge cost that was in force)
--   * whatever is left over      -> doubloons, at the same per-tier rate a part-dug chest now pays
--
-- Nobody who was one shard short of a chest loses that progress, and nobody gains from the change either. The
-- remainder pays in coin rather than rounding up, because rounding 46 people up to a free chest each is a
-- larger giveaway than it looks at the top of a chest economy.
--
-- The `fragments_json` column is deliberately LEFT IN PLACE, holding what it held. Dropping it in the same
-- migration that pays it out means that if the payout arithmetic is wrong there is nothing left to recompute
-- from — and a migration is SPENT after one run, so there would be no second chance. It can be dropped in a
-- later migration once the payout has been seen to be right.

-- 1. Whole chests: floor(held / 10) per tier, merged into the chest stash.
INSERT INTO mkt_user_chest (buyer_id, tier, count)
SELECT s.buyer_id, f.tier, (f.held / 10)::int
  FROM mkt_sailing s
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(s.fragments_json, '{}'::jsonb)) AS f(tier, held_text)
  CROSS JOIN LATERAL (SELECT GREATEST(0, COALESCE(NULLIF(f.held_text, '')::int, 0))) AS h(held)
 WHERE h.held >= 10
   AND f.tier IN ('wooden','iron','gold','mythic','ascendant','eternal','celestial','primordial')
ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + EXCLUDED.count;

-- 2. The remainder, in coin. Same per-tier values a part-dug chest pays (DIG_CONSOLATION in sailing.js), at a
--    tenth each — one shard was a tenth of a chest, so a tenth of the chest's consolation is the honest rate.
UPDATE mkt_sailing s
   SET doubloons = COALESCE(s.doubloons, 0) + c.coin,
       updated_at = NOW()
  FROM (
    SELECT s2.buyer_id,
           SUM(
             (GREATEST(0, COALESCE(NULLIF(f.held_text, '')::int, 0)) % 10)
             * CASE f.tier
                 WHEN 'wooden' THEN 2 WHEN 'iron' THEN 3 WHEN 'gold' THEN 5
                 WHEN 'mythic' THEN 8 WHEN 'ascendant' THEN 12 WHEN 'eternal' THEN 18
                 WHEN 'celestial' THEN 26 WHEN 'primordial' THEN 36 ELSE 2 END
           )::int AS coin
      FROM mkt_sailing s2
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(s2.fragments_json, '{}'::jsonb)) AS f(tier, held_text)
     GROUP BY s2.buyer_id
  ) c
 WHERE c.buyer_id = s.buyer_id AND c.coin > 0;
