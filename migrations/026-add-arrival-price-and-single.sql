-- Carry price and a "this is a single" marker on arrivals so the Discord broadcast can gate
-- low-value singles (scanned cards with a TCG-<id> SKU) below a threshold, while always posting
-- sealed product, supplies, etc. Email digests ignore these columns (category opt-in = send all).
ALTER TABLE product_alert_arrivals
    ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS is_single BOOLEAN NOT NULL DEFAULT FALSE;
