-- Admin-triggered, timed boss-fight buffs (e.g. "Double Damage" for 2 hours). A damage multiplier applied
-- to everyone's boss damage while active; the latest non-expired row is the active buff.
CREATE TABLE IF NOT EXISTS mkt_boss_buff (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label       TEXT NOT NULL,
    emoji       TEXT,
    damage_mult NUMERIC NOT NULL DEFAULT 2,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mkt_boss_buff_active ON mkt_boss_buff(expires_at DESC);
