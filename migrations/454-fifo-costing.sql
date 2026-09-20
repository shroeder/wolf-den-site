-- ── FIRST IN, FIRST OUT ──────────────────────────────────────────────────────────────────────────────────────
-- Luke: "It's supposed to be first in, first out. Meaning if we bought 12 ETBs at 120 and the remaining at 115,
-- it should reflect that in order."
--
-- What we had was LAST PRICE WINS: one cost per item, overwritten by whichever restock was entered most
-- recently, pushed to Square as a custom attribute. Buy 11 boxes at $120 and 5 at $115 and every one of the 16
-- costs out at $115 — which is exactly what happened to the 30th Celebration ETB.
--
-- FIFO cannot be one number. A sale's cost depends on how many of that item were sold BEFORE it, so it has to
-- be worked out per sale, in order, against the purchase batches. That is what this table holds.
--
-- ⚠️ WHY IT IS STORED RATHER THAN COMPUTED ON READ. Square cannot search orders by item, so answering "how
-- many of this sold before that sale" means scanning the order history every time anybody opens a report. The
-- reconciler walks it once, oldest to newest, and writes the answer down. Storing it also makes a sale's cost
-- STABLE: a purchase entered next week cannot retroactively change what last Tuesday's sale cost.
CREATE TABLE IF NOT EXISTS cogs_fifo_cost (
    order_id     TEXT NOT NULL,           -- Square order
    line_uid     TEXT NOT NULL,           -- Square line_item uid, unique within the order
    variation_id TEXT NOT NULL,
    sold_at      TIMESTAMPTZ NOT NULL,    -- the order's closed_at; the ordering key for allocation
    units        NUMERIC NOT NULL,
    -- What those units actually cost us, summed across however many batches they drew from. NULL is never
    -- written: a line we cannot cost is simply absent, so "no row" and "cost zero" stay different things.
    cost_cents   BIGINT NOT NULL,
    -- Which batches paid for it, as [{ledgerId, units, paidEachCents}] — so a number on a report can always
    -- be taken apart and shown to somebody who disagrees with it.
    batches      JSONB,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, line_uid)
);

-- The reconciler reads forward from where it stopped, and the report reads a window by item.
CREATE INDEX IF NOT EXISTS idx_fifo_cost_variation_sold ON cogs_fifo_cost (variation_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_fifo_cost_sold ON cogs_fifo_cost (sold_at DESC);

-- ── AND WHERE THE SCAN GOT TO ────────────────────────────────────────────────────────────────────────────────
-- One row. The reconciler is resumable because a full history scan is not something to repeat on every run,
-- and because allocation MUST happen in chronological order — restarting from the middle would hand the wrong
-- batch to the wrong sale.
CREATE TABLE IF NOT EXISTS cogs_fifo_cursor (
    id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    scanned_to   TIMESTAMPTZ,
    last_run_at  TIMESTAMPTZ,
    orders_seen  INT NOT NULL DEFAULT 0,
    lines_costed INT NOT NULL DEFAULT 0
);
