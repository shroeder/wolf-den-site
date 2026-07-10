-- Customer-initiated cancellation REQUESTS. A customer can ask to cancel; the owner reviews and
-- decides whether to honor it (there's no self-service refund). These record the ask; the owner's
-- actual cancel/refund still writes cancellation_reason/refund_* (migration 084).
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_request_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_request_status TEXT;
