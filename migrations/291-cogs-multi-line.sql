-- A restock could only ever record ONE line of cost.
--
-- idx_cogs_entry was UNIQUE on entry_id alone. The Restocking screen inserts one cogs_ledger row per line item,
-- all sharing the purchase's entry_id — so the first line saved and Postgres rejected every other one. The app
-- counts successes (`if (res.isSuccess) cogsOk++`) and never surfaces the failures, so it looked like it worked.
--
-- The damage, from the ledger:
--     8 items, paid $1,206  → COGS recorded $40
--     5 items, paid $806    → COGS recorded $32
--     4 items, paid $1,173  → COGS recorded $420
--     3 items, paid $670    → COGS recorded $160
--     5 items, paid $214    → COGS recorded $20
--     2 items, paid $190    → COGS recorded $80
-- Only the 1-item restocks were ever right. Gross profit in the reports and the break-even tracker has been
-- overstated by the difference on every multi-item purchase.
--
-- The constraint was presumably there to stop a double-post. That intent is preserved at the right grain:
-- one line per PRODUCT per purchase, which still makes a repeated submit idempotent-ish while letting a
-- purchase have as many line items as it has items.
DROP INDEX IF EXISTS idx_cogs_entry;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cogs_entry_product
    ON cogs_ledger (entry_id, product) WHERE entry_id IS NOT NULL;

-- entry_id is still looked up on its own (recap screens, backfills), so keep a plain index for it.
CREATE INDEX IF NOT EXISTS idx_cogs_entry_lookup
    ON cogs_ledger (entry_id) WHERE entry_id IS NOT NULL;
