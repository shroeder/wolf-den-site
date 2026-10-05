-- ── THE SAME SWEEP AGAIN, AND HERE IS WHY IT NEEDS TO BE A SECOND FILE ───────────────────────────────────
-- mig464 cleared the chips and tokens minted between mig462/463 and the deploy. It was run against the live
-- database straight away, which means it is already marked APPLIED — so it will not run again when this
-- release deploys, and anything minted in the hours since has nowhere to go.
--
-- ⚠️ A MIGRATION IS SPENT THE MOMENT IT IS APPLIED. Running one against production ahead of the deploy that
-- needs it is the trap: the data is right today and the deploy does nothing, so the window between the two
-- is unswept for ever. The fix is a new file, which deploys unapplied and runs at exactly the right moment.
--
-- This is the last one it can need: the code that mints chips and tokens is in THIS release, so after it runs
-- there is no source left.
INSERT INTO mkt_chip_event (buyer_id, delta, balance_after, reason, meta)
SELECT id, COALESCE(chips,0) + COALESCE(tokens,0), COALESCE(gold,0) + COALESCE(chips,0) + COALESCE(tokens,0),
       'currency_swept', jsonb_build_object('chips', COALESCE(chips,0), 'tokens', COALESCE(tokens,0), 'rate', 1)
  FROM mkt_buyer WHERE COALESCE(chips,0) > 0 OR COALESCE(tokens,0) > 0;
UPDATE mkt_buyer SET gold = COALESCE(gold,0) + COALESCE(chips,0) + COALESCE(tokens,0)
 WHERE COALESCE(chips,0) > 0 OR COALESCE(tokens,0) > 0;
UPDATE mkt_buyer SET chips = 0, tokens = 0 WHERE COALESCE(chips,0) <> 0 OR COALESCE(tokens,0) <> 0;
