-- Buyer accounts for the marketplace phone app. Buyers self-register (email + password); sessions are
-- token-based (bearer), same revocable/hash-only shape as mkt_vendor_session.

CREATE TABLE IF NOT EXISTS mkt_buyer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_buyer_email ON mkt_buyer (email_normalized);

CREATE TABLE IF NOT EXISTS mkt_buyer_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    device_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_buyer_session_token ON mkt_buyer_session (token_hash);
CREATE INDEX IF NOT EXISTS idx_mkt_buyer_session_buyer ON mkt_buyer_session (buyer_id);
