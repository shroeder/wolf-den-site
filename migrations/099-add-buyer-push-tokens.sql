-- Buyer push-notification tokens (Firebase Cloud Messaging). Drives DM + friend-request pushes to the
-- marketplace phone app. One row per device token; a buyer can have several devices. The token is
-- globally unique, so re-registering the same device on a different account moves the token to it.
CREATE TABLE IF NOT EXISTS mkt_push_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_push_token_buyer ON mkt_push_token (buyer_id);
