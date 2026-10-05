-- ── THE LIFETIME FIGURE WAS READING ONE LEDGER OUT OF TWO ────────────────────────────────────────────────
-- mig462 seeded casino_won from the win rows in mkt_chip_event. The old floor wrote its wins to TWO books —
-- mkt_chip_event and mkt_token_event, from different eras of the same system — and they hold DIFFERENT rows,
-- not copies. So the lifetime figure the whole Counter is built on was short for anybody whose play landed in
-- the other one.
--
-- How short: Sunflower Jinxx was missing 222,019 of her own winnings, Reece 66,013 against a seeded total of
-- 4,008 — he looked like somebody who had never won anything, which is exactly the member most likely to be
-- annoyed about the rework.
--
-- ⚠️ CAUGHT BY AN IMPOSSIBILITY, NOT BY A TEST. Reece was holding 98,529 in converted tokens against a
-- lifetime figure of 4,008, and you cannot hold more than you have won. A number that cannot be true is worth
-- more than a number that looks wrong, and it is the only reason this was found at all.
--
-- ADDITIVE, so it cannot double-count: it adds only what the second book holds, on top of what the first
-- already contributed.
UPDATE mkt_buyer b SET casino_won = COALESCE(b.casino_won, 0) + COALESCE(t.won, 0)
  FROM (SELECT buyer_id, SUM(GREATEST(delta, 0))::bigint AS won
          FROM mkt_token_event
         WHERE delta > 0 AND reason IN ('casino_slot_win','slot5','casino_bingo_win','casino_blackjack_win','casino_keno_win')
         GROUP BY buyer_id) t
 WHERE b.id = t.buyer_id;
