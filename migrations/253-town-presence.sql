-- The Wolf Den TOWN — a persistent social overworld where players walk around and see each other. This table
-- holds the LIVE position of anyone actively in the town (owner-only during the gated build; everyone once it
-- ships). Players not in the town are still shown as ambient avatars, positioned client-side from their id.
CREATE TABLE IF NOT EXISTS mkt_town_presence (
    buyer_id   UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    x          REAL NOT NULL DEFAULT 50,   -- 0..100 % of the plaza width
    y          REAL NOT NULL DEFAULT 74,   -- 0..100 % of the plaza height (ground band)
    facing     SMALLINT NOT NULL DEFAULT 1, -- 1 = right, -1 = left (sprite flip)
    status     TEXT,                        -- optional freeform status ("⚒️ forging")
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_town_presence_updated ON mkt_town_presence (updated_at DESC);
