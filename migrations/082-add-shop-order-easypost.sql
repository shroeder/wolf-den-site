-- EasyPost shipping: store the shipment + chosen rate so the admin can buy the label later, and the
-- bought label URL for reprints. Carrier/service are captured for display on the order + receipt.
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS easypost_shipment_id TEXT,
    ADD COLUMN IF NOT EXISTS easypost_rate_id TEXT,
    ADD COLUMN IF NOT EXISTS shipping_carrier TEXT,
    ADD COLUMN IF NOT EXISTS shipping_service TEXT,
    ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
