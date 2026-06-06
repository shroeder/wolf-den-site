ALTER TABLE shop_customer_accounts
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS shop_customer_email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES shop_customer_accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_email_verification_tokens_customer_id
    ON shop_customer_email_verification_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_customer_email_verification_tokens_expires_at
    ON shop_customer_email_verification_tokens(expires_at);

CREATE TABLE IF NOT EXISTS shop_customer_password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES shop_customer_accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_password_reset_tokens_customer_id
    ON shop_customer_password_reset_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_customer_password_reset_tokens_expires_at
    ON shop_customer_password_reset_tokens(expires_at);
