-- Audit ledger for loot-chest grants. mkt_user_chest only holds current COUNTS, so "where did this chest come
-- from?" was unanswerable. This records every grant (tier, count, source, when) so chest sources are traceable.
CREATE TABLE IF NOT EXISTS mkt_chest_grant (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL,
    tier       TEXT NOT NULL,                 -- wooden | iron | gold | mythic | ascendant | ...
    count      INTEGER NOT NULL DEFAULT 1,
    source     TEXT NOT NULL,                 -- boss_kill | level_up | daily_checkin | feature_daily | happy_hour | quest | daily_spin | harvest | sailing | referral | giveaway | admin_grant | ...
    meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mkt_chest_grant_buyer_idx  ON mkt_chest_grant (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_chest_grant_source_idx ON mkt_chest_grant (source, created_at DESC);
