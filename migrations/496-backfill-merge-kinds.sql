-- ── THE BACKFILL NEEDS ITS OWN NAMES IN THE MERGE LOG ───────────────────────────────────────────────────────
-- The live resolver decides from ids Plaid supplied. The backfill cannot — those rows predate the column —
-- so it decides from the SHAPE of the two descriptions, which is a weaker kind of evidence and must be
-- labelled as such. A year from now "why did these two become one row" should answer with which rule did it
-- and how much it knew.
ALTER TABLE ledger_merge_log DROP CONSTRAINT IF EXISTS ledger_merge_log_kind_check;
ALTER TABLE ledger_merge_log ADD CONSTRAINT ledger_merge_log_kind_check CHECK (kind IN (
    -- live, decided by a Plaid id
    'pending_posted',
    'same_external',
    'adopted_manual',
    -- backfill, decided by shape
    'backfill_uninformative',   -- one side said nothing ("VENMO", "CHECK", blank); the other named the money
    'backfill_subscription'     -- a subscription billed twice inside four days
));
