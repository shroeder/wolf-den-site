-- Link each online order to the customer who placed it (account + Square customer) so the customer
-- is visible on the order, in emails, and in the admin views — and so a customer can list their own
-- orders. Nullable for guest/legacy orders.
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS customer_id UUID,
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS square_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_shop_orders_customer_id ON shop_orders(customer_id);
