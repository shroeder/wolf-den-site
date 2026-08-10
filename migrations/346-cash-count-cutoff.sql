-- CASH SALES THAT ARRIVE AFTER THE DRAWER HAS ALREADY BEEN COUNTED
--
-- Counting the drawer writes a reconcile row that sets the ledger to the physical total. That total already
-- contains every cash sale rung before the count. But the Square cash sync only runs when someone opens the
-- ADMIN app, so sales routinely land in the ledger AFTER a count that already included their cash — and get
-- added a second time.
--
-- On 2026-08-09 that produced a $100.18 "shortfall" that was not a shortfall: the drawer was counted at
-- 21:01 on the 8th, the admin app pulled six of that evening's sales at 21:02, and $118.12 of cash that was
-- physically inside the counted total was added on top of it. Reconciled against Square the drawer was
-- $3.98 OVER. The same mechanism produced the -$138.67 on 2026-08-06.
--
-- Two columns fix it for good:
--   occurred_at     — when the money actually moved, to the second. `occurred_on` is a DATE, and a date
--                     cannot tell you whether a sale happened before or after a 9pm count.
--   already_counted — this row's cash was inside a physical count, so it must NOT move the balance again.
--                     The row is still kept, in full, because the history is the point; it is simply not
--                     added twice.
ALTER TABLE cash_ledger ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
ALTER TABLE cash_ledger ADD COLUMN IF NOT EXISTS already_counted boolean NOT NULL DEFAULT false;

-- The balance query filters on this, so it is worth an index.
CREATE INDEX IF NOT EXISTS cash_ledger_already_counted_idx ON cash_ledger (already_counted);

-- Who counted. The whole point of counting at each shift boundary is to narrow a discrepancy to a few hours
-- AND a person; counted_by has been null on every count ever recorded, so only half of that worked.
ALTER TABLE cash_count ADD COLUMN IF NOT EXISTS counted_by_device text;

-- Backfill occurred_at for existing rows so the cutoff has something to compare against on day one. created_at
-- is when we WROTE the row, which for a hand-entered movement is the moment it happened, and for a synced
-- Square sale is late — but it is never earlier than the sale, so using it here is conservative: it can only
-- fail to suppress, never suppress something it should not.
UPDATE cash_ledger SET occurred_at = created_at WHERE occurred_at IS NULL;
