ALTER TABLE shop_customer_accounts
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS two_factor_method TEXT NOT NULL DEFAULT 'email_otp';

CREATE TABLE IF NOT EXISTS shop_customer_oauth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES shop_customer_accounts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    email TEXT,
    email_normalized TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_oauth_identities_customer_id
    ON shop_customer_oauth_identities(customer_id);

CREATE TABLE IF NOT EXISTS shop_customer_two_factor_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES shop_customer_accounts(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_two_factor_codes_customer_id
    ON shop_customer_two_factor_codes(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_customer_two_factor_codes_expires_at
    ON shop_customer_two_factor_codes(expires_at);

CREATE TABLE IF NOT EXISTS shop_customer_trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES shop_customer_accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_trusted_devices_customer_id
    ON shop_customer_trusted_devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_customer_trusted_devices_expires_at
    ON shop_customer_trusted_devices(expires_at);
