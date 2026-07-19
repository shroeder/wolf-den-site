-- Granular customer activity telemetry — every meaningful action, not just XP-earning ones. Powers the
-- admin per-member action history + engagement/churn analytics (most vs least active).
CREATE TABLE IF NOT EXISTS mkt_activity_event (
    id BIGSERIAL PRIMARY KEY,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_buyer ON mkt_activity_event (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_recent ON mkt_activity_event (created_at DESC);
