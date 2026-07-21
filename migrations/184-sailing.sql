-- Sailing minigame (owner-gated, in development). One row per member tracks their boat's progression and any
-- active voyage. A voyage is defined purely by departed_at/returns_at timestamps so it resolves lazily on read
-- (no cron): idle when returns_at is null, sailing while now < returns_at, ready to collect once now >= it.
CREATE TABLE IF NOT EXISTS mkt_sailing (
    buyer_id          UUID PRIMARY KEY,
    boat_xp           INTEGER NOT NULL DEFAULT 0,
    speed_level       INTEGER NOT NULL DEFAULT 0,
    luck_level        INTEGER NOT NULL DEFAULT 0,
    departed_at       TIMESTAMPTZ,
    returns_at        TIMESTAMPTZ,
    voyages_completed INTEGER NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
