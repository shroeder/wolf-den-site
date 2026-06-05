CREATE TABLE IF NOT EXISTS shop_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_cart_items (
    cart_id UUID NOT NULL REFERENCES shop_carts(id) ON DELETE CASCADE,
    catalog_object_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cart_id, catalog_object_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_cart_items_cart_id ON shop_cart_items(cart_id);

ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES shop_carts(id),
    ADD COLUMN IF NOT EXISTS items_json JSONB;

CREATE INDEX IF NOT EXISTS idx_shop_orders_cart_id ON shop_orders(cart_id);
