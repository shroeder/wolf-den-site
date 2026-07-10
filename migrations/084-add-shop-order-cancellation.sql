-- Cancellation + refund tracking for online orders. When the owner cancels an order we record the
-- reason (shown to the customer), the Square refund id, the refunded amount, and when it happened.
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS refund_id TEXT,
    ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
