-- Per-feature daily quests (farm + sailing) — a dedicated, always-present set of daily bounties shown right on
-- each feature's screen, modeled on the Forge's daily tasks. One row per member/feature/day; `progress` is a
-- JSONB metric→count map fed by the same central quest metric pump, `claimed` lists which task keys were claimed.
CREATE TABLE IF NOT EXISTS mkt_feature_daily (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    feature  TEXT NOT NULL,                       -- 'farm' | 'sailing'
    day      DATE NOT NULL,
    progress JSONB NOT NULL DEFAULT '{}'::jsonb,
    claimed  JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (buyer_id, feature, day)
);
