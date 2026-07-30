-- ── SHARING A CREATION ───────────────────────────────────────────────────────────────────────────────────────
-- A member can pass a copy of one of their own AI creations to someone else exactly ONCE. After that the piece
-- is theirs alone forever. The copy the recipient receives can never be shared on, so a creation can spread to
-- at most one other farm and no further — the same "share a copy, then it's locked" shape as pet gifting.
--
-- shared_at is the whole guarantee: it's set inside a guarded UPDATE (… WHERE shared_at IS NULL), so even with
-- several offers or asks racing each other, exactly one can ever win.
ALTER TABLE mkt_custom_deco ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;

-- Set on the RECIPIENT's row, pointing at the creation it came from. Its presence means "this is a copy", which
-- is what blocks a copy from being shared onward. Also lets a farm credit the original artist.
ALTER TABLE mkt_custom_deco ADD COLUMN IF NOT EXISTS copy_of BIGINT;

CREATE TABLE IF NOT EXISTS mkt_creation_share (
    id            BIGSERIAL PRIMARY KEY,
    creation_id   BIGINT NOT NULL REFERENCES mkt_custom_deco(id) ON DELETE CASCADE,
    from_buyer_id UUID   NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,  -- the creation's owner
    to_buyer_id   UUID   NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,  -- who receives the copy
    -- 'gift'    = the owner offered it and the recipient accepts
    -- 'request' = someone saw it on a farm and asked; the OWNER accepts
    kind          TEXT   NOT NULL,
    status        TEXT   NOT NULL DEFAULT 'pending',  -- pending | accepted | declined | cancelled
    copy_id       BIGINT,                             -- the mkt_custom_deco row minted on accept
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);

-- At most ONE live offer per creation: without this an owner could offer the same piece to ten people and have
-- them all accept. Asks are deliberately NOT limited this way — several people may want the same piece, and the
-- owner chooses; accepting one auto-declines the rest.
CREATE UNIQUE INDEX IF NOT EXISTS idx_creation_share_one_gift
    ON mkt_creation_share (creation_id) WHERE status = 'pending' AND kind = 'gift';

-- One live ask per person per creation, so nobody can spam the same owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_creation_share_one_ask
    ON mkt_creation_share (creation_id, to_buyer_id) WHERE status = 'pending' AND kind = 'request';

CREATE INDEX IF NOT EXISTS idx_creation_share_inbox ON mkt_creation_share (to_buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_creation_share_owner ON mkt_creation_share (from_buyer_id, status);
