-- Happy Hour — a timed server-wide multiplier the community can STRENGTHEN by donating gold into a shared
-- pool. Crossing breakpoints steps the multiplier up. One active event at a time (latest with ends_at in
-- the future). The multiplier boosts XP (which cascades to gold + pet-XP via awardXp).
CREATE TABLE IF NOT EXISTS mkt_happy_hour (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind       TEXT NOT NULL DEFAULT 'happy_hour',
    resource   TEXT NOT NULL DEFAULT 'xp',
    base_mult  INT NOT NULL DEFAULT 2,
    pool_gold  BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_happy_hour_ends ON mkt_happy_hour (ends_at);

-- Per-member contribution to the current event's pool (for "you donated X" + top donors).
CREATE TABLE IF NOT EXISTS mkt_happy_hour_donation (
    event_id UUID NOT NULL REFERENCES mkt_happy_hour(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    gold     BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, buyer_id)
);
