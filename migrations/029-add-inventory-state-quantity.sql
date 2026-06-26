-- Track last-seen on-hand quantity per variation so the arrival scan can treat ANY quantity
-- increase as a restock (a top-up of an item that never hit zero), not only a 0 -> back-in-stock
-- flip. The 4-hourly poll missed same-day sell-out/refill cycles and never saw top-ups at all,
-- so most real restocks produced no Discord/email alert.
--
-- Nullable on purpose (no DEFAULT): existing rows get NULL = "quantity not yet baselined". The
-- detection code suppresses the quantity-increase signal when the prior quantity is NULL, so the
-- first scan after this migration silently re-baselines on-hand counts instead of flagging the
-- entire in-stock catalog as a restock. A genuine out-of-stock -> in-stock return is still detected
-- via the existing in_stock flag, independent of this column.
ALTER TABLE product_alert_inventory_state
    ADD COLUMN IF NOT EXISTS quantity INTEGER;
