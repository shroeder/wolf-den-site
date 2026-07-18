-- Daily quests: 3 rotating bounties per member per day (deterministic pick per buyer+day) that reward
-- gold / a loot chest on completion. The 3 quest keys for a given (buyer, day) are stable, so rows can be
-- lazily inserted from any action hook (ON CONFLICT DO NOTHING) without losing progress.
CREATE TABLE IF NOT EXISTS mkt_daily_quest (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    day          DATE NOT NULL,
    quest_key    TEXT NOT NULL,
    progress     INT NOT NULL DEFAULT 0,
    target       INT NOT NULL DEFAULT 1,
    reward_gold  INT NOT NULL DEFAULT 0,
    reward_chest TEXT,
    claimed_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (buyer_id, day, quest_key)
);
CREATE INDEX IF NOT EXISTS idx_mkt_daily_quest_lookup ON mkt_daily_quest (buyer_id, day);
