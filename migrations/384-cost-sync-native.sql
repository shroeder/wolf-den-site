-- ── WHAT SQUARE'S OWN COST FIELD SAYS, WHICH WE CANNOT CHANGE ────────────────────────────────────────────────
-- Measured against the live catalog on 17 Aug, four ways, on both a variation that already had a vendor info
-- and one that had none:
--
--   in-place price edit    → 200, value unchanged
--   replace the array      → 200, old entry still there
--   clear then re-add      → 200, old entry still there
--   upsert via parent ITEM → 200, value unchanged
--   add where none exists  → 200, nothing created
--
-- So item_variation_vendor_infos[].price_money is write-at-CREATE only: a restock that creates the item sets
-- it, and nothing afterwards can move it. (The July note saying native cost is API-writable was reading that
-- create case. Both halves of the confusion are the same 200-means-nothing trap.)
--
-- The consequence for the reconciler: a row is reconciled when wolfden_unit_cost — the attribute our own COGS
-- resolver actually reads — holds the cost. Square's built-in reporting keeps its own frozen number, and
-- holding every row `failed` over a field the API refuses to write would make the whole queue permanently red
-- and worth ignoring. So we RECORD that number instead: native_cost is what Square thinks it paid, captured on
-- every sync, and the gap between it and desired_cost is the list of items someone has to fix in the Square
-- dashboard by hand — or that the next re-create will fix by itself.
ALTER TABLE cost_sync ADD COLUMN IF NOT EXISTS native_cost NUMERIC(12,2);

-- The report that matters: everything where Square's own cost disagrees with what we actually paid.
CREATE INDEX IF NOT EXISTS cost_sync_native_gap_idx ON cost_sync (variation_id)
    WHERE native_cost IS DISTINCT FROM desired_cost;
