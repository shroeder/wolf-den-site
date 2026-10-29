-- ── THE MERGE LOG LEARNS THE TWO KINDS THE BANK ITSELF DECIDES ──────────────────────────────────────────────
-- Luke: "You have access to my bank via plaid right? I dont understand why you cant figure out whats real and
-- not" — and he was right. The shape-based kinds below ('backfill_uninformative', 'backfill_subscription')
-- guessed from how two descriptions looked. These two do not guess:
--
--   plaid_pending_posted   Plaid's own `pending_transaction_id` names this row as the pending half of a charge
--                          we also hold posted. The bank is stating the duplicate outright.
--   plaid_shadow_copy      Plaid has no record of this row's id, AND the bank holds exactly one transaction of
--                          that amount in that window, AND another ledger row already carries that
--                          transaction's id. So the books hold two copies of a charge the bank has once, and
--                          the other copy is the one the bank can vouch for.
--
-- Kept distinct from the backfill kinds on purpose: a year from now, "why did these two become one row" should
-- answer with HOW MUCH THE RULE KNEW. These two can be re-derived from the bank; the backfill ones cannot.
ALTER TABLE ledger_merge_log DROP CONSTRAINT IF EXISTS ledger_merge_log_kind_check;
ALTER TABLE ledger_merge_log ADD CONSTRAINT ledger_merge_log_kind_check CHECK (kind IN (
    -- live resolver, decided by a Plaid id as the transaction arrives
    'pending_posted',
    'same_external',
    'adopted_manual',
    -- reconciliation against the bank's current truth
    'plaid_pending_posted',
    'plaid_shadow_copy',
    -- historical backfill, decided by the shape of two descriptions
    'backfill_uninformative',
    'backfill_subscription',
    'backfill_same_payee'
));
