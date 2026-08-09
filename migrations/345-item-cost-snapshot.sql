-- A LOCAL, PERMANENT record of what we paid for a thing.
--
-- Until now the ONLY store of unit cost was Square itself: the `wolfden_unit_cost` custom attribute on the
-- catalog variation, read LIVE at report time. That makes the catalog the ledger's memory, and a catalog is
-- not a ledger — it describes what you sell today, not what you sold in May. On 2026-08-08 the intake flow
-- switched from ARCHIVING sold-out items to DELETING them (to stop name collisions), and every historical
-- sale of a deleted item instantly reported $0.00 cost and 100% profit, back through July, June and May.
--
-- Square soft-deletes, so the costs were recoverable this time (batch-retrieve with include_deleted_objects).
-- They will not be recoverable forever, and the next thing that rewrites a catalog object -- an edit, a
-- re-import, a genuine purge -- rewrites history again. So the cost gets copied HERE, once, and history reads
-- from here.
--
-- One row per variation. `unit_cost_cents` is what one unit cost us.
--   source: 'square_attr'   -- the wolfden_unit_cost custom attribute (what the app writes)
--           'square_vendor' -- item_variation_vendor_infos price (Square's own vendor cost)
--           'square_native' -- default_unit_cost / cost_money, set in the Square Dashboard
--           'cogs_export'   -- hydrated from Square's Cost of Goods Sold report CSV
--           'manual'        -- entered by hand
CREATE TABLE IF NOT EXISTS wolfden_item_cost (
    variation_id     TEXT PRIMARY KEY,
    unit_cost_cents  BIGINT NOT NULL CHECK (unit_cost_cents >= 0),
    source           TEXT   NOT NULL,
    item_name        TEXT,
    sku              TEXT,
    -- TRUE once the variation is gone from the live catalog: this row is then the only copy that exists.
    from_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reporting sweeps a month of sales and asks for a few hundred variations at once.
CREATE INDEX IF NOT EXISTS wolfden_item_cost_source_idx ON wolfden_item_cost (source);
