-- Town Development: a shared, community-funded upgrade catalog. One GLOBAL row per project (level + gold
-- banked toward the next level). Extensible forever — new projects are just new rows/catalog entries.
CREATE TABLE IF NOT EXISTS mkt_town_project (
    project_id TEXT PRIMARY KEY,
    level      INTEGER NOT NULL DEFAULT 0,
    gold_in    BIGINT  NOT NULL DEFAULT 0,   -- gold banked toward the NEXT level
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Who contributed how much (for a future "top patrons" board + telemetry).
CREATE TABLE IF NOT EXISTS mkt_town_project_gift (
    id         BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL,
    buyer_id   UUID NOT NULL,
    amount     INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_town_project_gift ON mkt_town_project_gift (project_id, buyer_id);
