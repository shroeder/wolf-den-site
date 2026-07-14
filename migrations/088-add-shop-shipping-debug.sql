-- Temporary diagnostic: record why each live-rate request does or doesn't produce rates, so we can
-- see (via the admin diagnose endpoint) exactly what a real buyer's request hit. Safe to drop later.
CREATE TABLE IF NOT EXISTS shop_shipping_debug (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    host TEXT,
    origin TEXT,
    referer TEXT,
    trusted BOOLEAN,
    payments_enabled BOOLEAN,
    easypost_enabled BOOLEAN,
    item_count INTEGER,
    rate_count INTEGER,
    note TEXT
);
