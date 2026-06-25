-- Per-tenant integration credentials (Square OAuth tokens, Plaid item access token),
-- encrypted at rest. The admin-app proxy resolves a store's credentials from here
-- instead of global env vars (with an env fallback for the flagship store).

BEGIN;

CREATE TABLE IF NOT EXISTS store_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,                       -- 'square' | 'plaid'
    status TEXT NOT NULL DEFAULT 'disconnected',  -- connected | disconnected | error | reauth_required
    credential_encrypted TEXT,                    -- AES-256-GCM blob: JSON {access_token, refresh_token?}
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,  -- square: {location_id, merchant_id}; plaid: {item_id}
    expires_at TIMESTAMPTZ,                        -- square access-token expiry (drives refresh)
    last_refreshed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_store_integrations_store ON store_integrations (store_id);

COMMIT;
