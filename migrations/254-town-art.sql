-- Shared AI art for the Wolf Den Town (side-scrolling): a wide panoramic street BACKGROUND (repeated/mirrored
-- to scroll forever) plus transparent BUILDING sprites laid on top. Generate once + store (like pet sprites).
CREATE TABLE IF NOT EXISTS mkt_town_art (
    art_key    TEXT PRIMARY KEY,   -- 'background' | 'forge' | 'docks' | 'boss' | 'farm' | 'shop' | 'tavern'
    url        TEXT NOT NULL,
    flip       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
