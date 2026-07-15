-- Social layer: friendships + user-to-user DMs (distinct from the buyer<->vendor mkt_thread system).
-- Messages can carry an optional shared product so a "share this card" lands as a rich card in the chat.

-- Friendships: one row per pair, request/accept. Uniqueness is on the unordered pair so a request can't
-- be duplicated in either direction.
CREATE TABLE IF NOT EXISTS mkt_friendship (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_friendship_pair
    ON mkt_friendship (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_mkt_friendship_addressee ON mkt_friendship (addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_friendship_requester ON mkt_friendship (requester_id, status);

-- User-to-user DM threads. user_a is always the lexicographically-lesser id so a pair maps to one thread.
CREATE TABLE IF NOT EXISTS mkt_dm_thread (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    a_last_read_at TIMESTAMPTZ,
    b_last_read_at TIMESTAMPTZ,
    UNIQUE (user_a, user_b),
    CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS idx_mkt_dm_thread_a ON mkt_dm_thread (user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_dm_thread_b ON mkt_dm_thread (user_b, last_message_at DESC);

CREATE TABLE IF NOT EXISTS mkt_dm_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES mkt_dm_thread(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    catalog_product_id TEXT,      -- optional shared product (renders as a card in the chat)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_dm_message_thread ON mkt_dm_message (thread_id, created_at);
