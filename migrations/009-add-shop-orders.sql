CREATE TABLE IF NOT EXISTS shop_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_object_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    online_fee_cents INTEGER NOT NULL CHECK (online_fee_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'canceled')),
    idempotency_key TEXT NOT NULL UNIQUE,
    square_payment_id TEXT UNIQUE,
    square_status TEXT,
    receipt_url TEXT,
    payment_error_code TEXT,
    payment_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_created_at ON shop_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);
CREATE INDEX IF NOT EXISTS idx_shop_orders_square_payment_id ON shop_orders(square_payment_id);
