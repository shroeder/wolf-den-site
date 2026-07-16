-- First-class DM: emoji reactions (one per person per message) + ephemeral typing signals.
CREATE TABLE IF NOT EXISTS mkt_dm_reaction (
    message_id UUID NOT NULL REFERENCES mkt_dm_message(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_dm_reaction_msg ON mkt_dm_reaction (message_id);

CREATE TABLE IF NOT EXISTS mkt_dm_typing (
    thread_id UUID NOT NULL REFERENCES mkt_dm_thread(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, buyer_id)
);
