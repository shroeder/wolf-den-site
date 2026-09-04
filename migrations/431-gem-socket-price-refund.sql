-- ── THE BENCH GOT SIX TIMES CHEAPER AND NOBODY WHO PAID THE OLD PRICE GOT THE DIFFERENCE ─────────────────────
-- Sunflower Jinxx, in global chat: "Since the cost of cutting gem slots has been greatly reduced can those of
-- us who spent the original high prices get refunded the difference please? Since gold is harder to come by
-- now." Luke: "number nine is fine to refund."
--
-- SOCKET_COST was divided straight through by six ("lower the cost of socketing items by 6x as well") — the
-- shape of the ladder is unchanged and only its height moved. Anyone who cut a socket before that paid up to
-- 20,000 gold for a mythic seat that costs 3,333 today.
--
-- ── COMPUTED FROM WHAT EACH PERSON ACTUALLY PAID, NOT FROM A DATE ────────────────────────────────────────────
-- Every cut writes a `socket_cut` activity event carrying { itemId, cost }, so the price paid is on the row.
-- The refund is `paid - socketCost(rarity of that item)` per cut, summed per member, and anything already at
-- or below today's price refunds nothing. No cutoff date is involved and none is needed — which matters,
-- because a date would have to be guessed and would silently pay or skip the cuts either side of it.
--
-- Measured across all 20 socket_cut events: 4 were already at the new price, 0 referenced an unknown item, and
-- 11 members are owed 87,084 gold between them. The figures below are that calculation, written out rather
-- than recomputed, because the rarity table lives in JavaScript and a migration cannot read it.
--
-- Refunds are deliberately NOT run through the mint rate — gold-rate.js draws that line already: a refund
-- returns money somebody spent, it does not create any.

UPDATE mkt_buyer SET gold = gold + v.amount
  FROM (VALUES
    ('7b05a5ed-3913-4852-a680-b97a449488d9'::uuid, 21667),   -- SoullessShiitake
    ('eaf1da90-eefc-4852-af7b-c988430cb77e'::uuid, 16667),   -- Sunflower Jinxx
    ('6857d67e-3dd0-46b6-aad7-b91699155ff6'::uuid, 10000),   -- The Wolf Den
    ('d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e'::uuid, 10000),   -- Eric D
    ('cd8f4cd8-330a-4ead-ab34-b664fdd6dacf'::uuid,  6250),   -- aannw
    ('70ebdb81-37c7-40e7-a6a7-36b805ba2440'::uuid,  5000),   -- YoshiHwan
    ('134b5e8b-105c-49a4-b1d9-dc4d3769980b'::uuid,  5000),   -- Brecken22
    ('67b6a8a0-31b6-44b9-b11a-ad756e5c1d6d'::uuid,  5000),   -- Scottie
    ('2e5dd7db-58ec-49f9-b74b-63a6a87dbbf1'::uuid,  2500),   -- Mr.Wakey
    ('0afc1091-38a8-4a03-ac20-15dc86f5b9c4'::uuid,  2500),   -- GrayKitsune
    ('3d68833a-a8b6-43e5-8693-7cf225476751'::uuid,  2500)    -- Teegs
  ) AS v(buyer_id, amount)
 WHERE mkt_buyer.id = v.buyer_id;

-- The ledger is where the mint rate is read from, so a payout that is not on it is a payout nobody can audit.
-- Only rows whose member actually exists — the UPDATE above is guarded the same way by its join.
INSERT INTO mkt_coin_event (buyer_id, delta, reason, meta)
SELECT v.buyer_id, v.amount, 'gem_socket_refund',
       jsonb_build_object('why', 'SOCKET_COST cut 6x; refunding the difference on cuts paid at the old price')
  FROM (VALUES
    ('7b05a5ed-3913-4852-a680-b97a449488d9'::uuid, 21667),
    ('eaf1da90-eefc-4852-af7b-c988430cb77e'::uuid, 16667),
    ('6857d67e-3dd0-46b6-aad7-b91699155ff6'::uuid, 10000),
    ('d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e'::uuid, 10000),
    ('cd8f4cd8-330a-4ead-ab34-b664fdd6dacf'::uuid,  6250),
    ('70ebdb81-37c7-40e7-a6a7-36b805ba2440'::uuid,  5000),
    ('134b5e8b-105c-49a4-b1d9-dc4d3769980b'::uuid,  5000),
    ('67b6a8a0-31b6-44b9-b11a-ad756e5c1d6d'::uuid,  5000),
    ('2e5dd7db-58ec-49f9-b74b-63a6a87dbbf1'::uuid,  2500),
    ('0afc1091-38a8-4a03-ac20-15dc86f5b9c4'::uuid,  2500),
    ('3d68833a-a8b6-43e5-8693-7cf225476751'::uuid,  2500)
  ) AS v(buyer_id, amount)
 WHERE EXISTS (SELECT 1 FROM mkt_buyer b WHERE b.id = v.buyer_id);
