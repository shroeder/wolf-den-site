ALTER TABLE shop_carts
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES shop_customer_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shop_carts_customer_id ON shop_carts(customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_carts_customer_id_unique
    ON shop_carts(customer_id)
    WHERE customer_id IS NOT NULL;
