-- Browser Web Push subscriptions for marketplace members. Each row is one browser/device that opted in
-- via the "Allow notifications?" prompt. Keyed to a buyer so sendWebPush() can target a member. The
-- endpoint (the browser's push service URL) is globally unique; a re-subscribe upserts by endpoint.
CREATE TABLE IF NOT EXISTS mkt_web_push (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL UNIQUE,        -- push service endpoint (the subscription's address)
    p256dh       TEXT NOT NULL,               -- client public key (payload encryption)
    auth         TEXT NOT NULL,               -- client auth secret (payload encryption)
    user_agent   TEXT,                        -- for the member to recognize the device in a list
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mkt_web_push_buyer_idx ON mkt_web_push (buyer_id);
