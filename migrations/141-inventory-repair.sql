-- Durable repair queue for inventory decrements that FAILED (Square IN_STOCK->SOLD didn't apply) instead
-- of being swallowed to a log line. Every leak point (online checkout, trades, mystery packing, barter)
-- records here so nothing is silently lost, and the Remediations tab can review + retry them.
CREATE TABLE IF NOT EXISTS inventory_repair (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variation_id TEXT,
    item_name    TEXT,
    from_state   TEXT NOT NULL DEFAULT 'IN_STOCK',
    to_state     TEXT NOT NULL DEFAULT 'SOLD',
    quantity     INT NOT NULL DEFAULT 1,
    source       TEXT NOT NULL,          -- shop_order | trade_credit | mystery_pack | barter | ...
    reference    TEXT,                   -- order id / trade id / entry id that the leak belongs to
    error        TEXT,
    status       TEXT NOT NULL DEFAULT 'open',  -- open | resolved | dismissed
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ,
    UNIQUE (source, reference, variation_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_repair_open ON inventory_repair (status, created_at) WHERE status = 'open';

-- Track whether an online order's inventory decrement actually landed, so a webhook/retry can finish a
-- decrement that failed or never ran (payment completed after the checkout response).
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS inventory_adjusted_at TIMESTAMPTZ;
