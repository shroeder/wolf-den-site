CREATE TABLE IF NOT EXISTS shop_customer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    square_customer_id TEXT UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_accounts_email ON shop_customer_accounts(email_normalized);
CREATE INDEX IF NOT EXISTS idx_shop_customer_accounts_square_customer_id ON shop_customer_accounts(square_customer_id);
