-- ── THE LAST OF THE DEAD CURRENCY ────────────────────────────────────────────────────────────────────────
-- mig462 and mig463 converted every chip and token in the game to gold. Three members had a balance again
-- within the hour — not a bug in the migration, a consequence of running one against a LIVE game: the
-- machines were still paying the old currencies until the code that converts them is deployed, and people
-- were playing in the gap.
--
-- ⚠️ MIGRATIONS RUN ON DEPLOY, WHICH IS EXACTLY WHEN THIS NEEDS TO HAPPEN. This one lands in the same release
-- as the code that stops minting them, so it sweeps the gap and there is no gap after it. Identical body to
-- the other two, deliberately — a sweep that is a copy of the thing it is sweeping up after cannot disagree
-- with it about the rate.
INSERT INTO mkt_chip_event (buyer_id, delta, balance_after, reason, meta)
SELECT id, COALESCE(chips,0) + COALESCE(tokens,0), COALESCE(gold,0) + COALESCE(chips,0) + COALESCE(tokens,0),
       'currency_swept', jsonb_build_object('chips', COALESCE(chips,0), 'tokens', COALESCE(tokens,0), 'rate', 1)
  FROM mkt_buyer WHERE COALESCE(chips,0) > 0 OR COALESCE(tokens,0) > 0;
UPDATE mkt_buyer SET gold = COALESCE(gold,0) + COALESCE(chips,0) + COALESCE(tokens,0)
 WHERE COALESCE(chips,0) > 0 OR COALESCE(tokens,0) > 0;
UPDATE mkt_buyer SET chips = 0, tokens = 0 WHERE COALESCE(chips,0) <> 0 OR COALESCE(tokens,0) <> 0;
