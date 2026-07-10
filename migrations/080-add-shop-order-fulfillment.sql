-- Fulfillment tracking for online shop orders so the owner can mark them shipped / picked up
-- and record a tracking number from the admin orders view.
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled'
        CHECK (fulfillment_status IN ('unfulfilled', 'ready', 'shipped', 'picked_up', 'cancelled')),
    ADD COLUMN IF NOT EXISTS tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;
