-- ── A PARTLY-COVERED SALE MUST NOT BE PRICED AS IF IT WERE COVERED ───────────────────────────────────────────
-- allocate() already reports how many units the purchase batches could not pay for, and fifo.js already says
-- those units must never be costed at zero. Storing the row anyway defeated that: the app applies the stored
-- cost as the cost of the WHOLE line, so a sale of 2 with only 1 unit of purchase history behind it was
-- charged one unit's cost and the other unit came out free.
--
-- Measured on real history it was 3 rows of 100 — two Journey Together packs booked at $3.50/unit against a
-- $7.00 batch, and a First Partner collection at $16.00 against $32.00.
--
-- The row is still written, because the units WERE sold and remainingFor() has to count them or the shelf
-- valuation overstates what is left. What changes is that storedCosts() refuses to hand a short row to the
-- report — the line falls through to the old per-unit cost, which at least prices every unit.
ALTER TABLE cogs_fifo_cost ADD COLUMN IF NOT EXISTS short_units NUMERIC NOT NULL DEFAULT 0;

-- The annotate path asks for "rows for these orders that are safe to report", so it filters on this.
CREATE INDEX IF NOT EXISTS idx_fifo_cost_order_short ON cogs_fifo_cost (order_id) WHERE short_units = 0;
