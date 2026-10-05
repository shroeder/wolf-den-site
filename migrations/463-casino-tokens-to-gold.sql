-- ── THE SECOND DEAD CURRENCY ─────────────────────────────────────────────────────────────────────────────
-- The old floor had TWO: you staked `chips` and you were paid `tokens`, and the Counter spent tokens. mig462
-- converted the chips; this converts the tokens, for exactly the same reason — the Counter is a ladder now,
-- so a token balance is a number on a screen that nothing in the game will ever accept again.
--
-- 33 members hold 464,646 between them. 1:1 to gold, because a token was minted against a machine's own
-- payout in gold units (CHIP_RATE 1). Writing them off would be taking back something somebody won.
--
-- ⚠️ THROUGH THE CASINO'S OWN LEDGER so the conversion is a row somebody can point at, not a silent UPDATE.
INSERT INTO mkt_chip_event (buyer_id, delta, balance_after, reason, meta)
SELECT id, tokens, COALESCE(gold, 0) + tokens, 'tokens_converted',
       jsonb_build_object('tokens', tokens, 'rate', 1)
  FROM mkt_buyer WHERE COALESCE(tokens, 0) > 0;
UPDATE mkt_buyer SET gold = COALESCE(gold, 0) + tokens WHERE COALESCE(tokens, 0) > 0;
UPDATE mkt_buyer SET tokens = 0 WHERE COALESCE(tokens, 0) <> 0;

-- ── AND THE FREE THOUSAND A DAY IS OVER ──────────────────────────────────────────────────────────────────
-- Luke: "Also no more claiming 1k per day."
--
-- Measured before it went: 559 claims over 34 days, 16,441 a day minted for nothing — the second largest
-- faucet on the floor after bingo itself. The column is cleared so that a member who claimed today is not
-- left with a timestamp pointing at a button that no longer exists.
UPDATE mkt_buyer SET chips_day = NULL WHERE chips_day IS NOT NULL;
