-- Loyalty XP + levels. Everyone earns XP for meaningful actions; level is derived from total XP.
-- A cached total on mkt_buyer keeps profile reads cheap; mkt_xp_event is the append-only ledger.

ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS mkt_xp_event (
    id BIGSERIAL PRIMARY KEY,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    points INTEGER NOT NULL,
    dedupe_key TEXT,            -- optional idempotency (e.g. 'message:<threadId>:<yyyy-mm-dd>')
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_xp_event_buyer ON mkt_xp_event (buyer_id);
-- Dedupe: at most one event per key. Partial so un-keyed events don't collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_xp_event_dedupe ON mkt_xp_event (dedupe_key) WHERE dedupe_key IS NOT NULL;
