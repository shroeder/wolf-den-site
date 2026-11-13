-- ── WHAT A MEMBER ACTUALLY BOUGHT, KEPT LOCALLY ──────────────────────────────────────────────────────────────
-- Luke, 2026-11-13: "we can look at people's sales, like transactions, right? We have a relationship to know
-- what kind of items they're interested in."
--
-- We do, but not in this database. A member's purchases are recorded as `purchase_spend` XP events carrying a
-- Square order id and a dollar amount — WHAT was in the basket lives only at Square. Measured before writing
-- this: 439 purchase events, 401 of them Square orders, all 401 retrievable, 1,013 line items with a catalog
-- id, across 123 members. The relationship is real; it is just one API call away.
--
-- ⚠️ IT IS CACHED RATHER THAN FETCHED PER RUN, AND THE REASON IS THE BILL. `neon()` is the HTTP driver and
-- Square is a second network hop; a nightly job that batch-retrieves 400 orders to answer "what does this
-- person like" is paying Active CPU for an answer that only changes when somebody buys something. The sync
-- walks orders it has not seen before, so steady-state is a handful of rows a day. See CLAUDE.md, family A.
CREATE TABLE IF NOT EXISTS mkt_purchase_line (
    id            BIGSERIAL PRIMARY KEY,
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    order_id      TEXT NOT NULL,              -- the Square order id, without the "sq:" prefix
    variation_id  TEXT,                       -- line_items[].catalog_object_id, NULL for custom amounts
    name          TEXT,
    category      TEXT,                       -- resolved from inventory_feed, else the catalog API
    amount_cents  INTEGER NOT NULL DEFAULT 0,
    quantity      NUMERIC NOT NULL DEFAULT 1,
    bought_at     TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per line of one order. A Square order can legitimately carry the same variation twice (two singles
-- of the same card at different conditions arrive as separate lines), so the key includes the line's own
-- position — which is why the sync deletes an order's rows before re-inserting rather than upserting.
CREATE INDEX IF NOT EXISTS idx_purchase_line_buyer ON mkt_purchase_line (buyer_id, bought_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_line_order ON mkt_purchase_line (order_id);

-- ── THE SEND LOG, WHICH IS THE THING THAT STOPS THIS BEING SPAM ─────────────────────────────────────────────
-- Luke: "we only want to bug them once. We don't want to spam them because it's important that we don't get
-- people unsubscribing or reporting us as spam."
--
-- ⚠️ ONCE MEANS ONCE, AND THE DATABASE IS WHAT ENFORCES IT — not the query that picks the cohort. A cohort
-- query is one WHERE clause away from forgetting; a UNIQUE constraint on buyer_id cannot. A second wave is
-- therefore not something the schedule can decide to do: it needs a new `campaign` value, written by hand by
-- somebody who meant it.
CREATE TABLE IF NOT EXISTS mkt_outreach_send (
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    campaign    TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (buyer_id, campaign)
);

-- The one-per-person-ever rule, as an index rather than as a habit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_once ON mkt_outreach_send (buyer_id);
