ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'shipping' CHECK (fulfillment_mode IN ('shipping', 'pickup')),
    ADD COLUMN IF NOT EXISTS shipping_name TEXT,
    ADD COLUMN IF NOT EXISTS shipping_email TEXT,
    ADD COLUMN IF NOT EXISTS shipping_phone TEXT,
    ADD COLUMN IF NOT EXISTS shipping_address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS shipping_address_line2 TEXT,
    ADD COLUMN IF NOT EXISTS shipping_city TEXT,
    ADD COLUMN IF NOT EXISTS shipping_state TEXT,
    ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT,
    ADD COLUMN IF NOT EXISTS shipping_country TEXT,
    ADD COLUMN IF NOT EXISTS shipping_validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (shipping_validation_status IN ('pending', 'valid', 'invalid', 'not_required'));

CREATE INDEX IF NOT EXISTS idx_shop_orders_fulfillment_mode ON shop_orders(fulfillment_mode);
