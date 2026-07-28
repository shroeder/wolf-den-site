-- Town live chat: ephemeral speech-bubble messages shown above avatars in the plaza, plus a typing signal.
CREATE TABLE IF NOT EXISTS mkt_town_chat (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_town_chat_recent ON mkt_town_chat (created_at DESC);

-- "…is typing" signal lives on the presence row (transient timestamp; recent = typing).
ALTER TABLE mkt_town_presence ADD COLUMN IF NOT EXISTS typing_at TIMESTAMPTZ;
