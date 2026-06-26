-- Direct webhook -> Discord new-arrival broadcasts. This moves Discord posting out of the 15-min
-- product-alerts cron and into the Square inventory webhook, so a count increase posts immediately
-- with minimal logic (the only filter is a single-card price gate).
--
-- These tables are independent of the cron scan's product_alert_inventory_state (which the email
-- digest still owns). The webhook needs its OWN last-known on-hand count per variation so it can
-- post the moment a count increases, without the cron's re-baseline/zeroing logic racing it.
CREATE TABLE IF NOT EXISTS discord_alert_inventory (
    variation_id TEXT PRIMARY KEY,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the baseline from the cron scan's last snapshot so (a) an already-in-stock item whose count
-- later changes isn't mistaken for a brand-new arrival, and (b) a sale on a never-before-webhooked
-- item doesn't look like an increase from zero. Variations absent here are treated as qty 0
-- (genuinely never stocked), which is the correct baseline for a true first arrival.
INSERT INTO discord_alert_inventory (variation_id, quantity)
    SELECT variation_id, COALESCE(quantity, 0)
    FROM product_alert_inventory_state
    ON CONFLICT (variation_id) DO NOTHING;

-- Event-level idempotency. Square retries webhook deliveries and can reorder them, so a re-delivered
-- older "count up" event could re-post after a later sale lowered the stored quantity. Recording
-- each handled event_id makes processing skip duplicates entirely.
CREATE TABLE IF NOT EXISTS discord_alert_events (
    event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
