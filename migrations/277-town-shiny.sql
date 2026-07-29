-- The hidden "shiny glint" — a rare, barely-visible sparkle that drifts through the Town background 0-2× a day.
-- First member to spot & tap it claims a source-exclusive decoration; it's SHARED (one winner) then it's gone.
CREATE TABLE IF NOT EXISTS mkt_town_shiny (
    id          BIGSERIAL PRIMARY KEY,
    spawned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    x           REAL NOT NULL,            -- % across the world
    y           REAL NOT NULL,            -- % from top (kept high — it hides in the sky/rooftops)
    claimed_by  UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    claimed_at  TIMESTAMPTZ,
    reward_deco TEXT
);
-- At most one live (unclaimed, unexpired) glint at a time; helps the spawn guard.
CREATE INDEX IF NOT EXISTS idx_town_shiny_live ON mkt_town_shiny (expires_at) WHERE claimed_by IS NULL;
