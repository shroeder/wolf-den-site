-- Store the tax and shipping charged on each online order (for receipts, reports, and reconciliation).
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS tax_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 0;
