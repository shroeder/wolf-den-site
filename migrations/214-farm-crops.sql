-- Farming: plant seeds (found across the game) → crops grow over real time → harvest to sell for gold, with
-- a small chance at a loot chest. Rain (checked on load) and bought fertilizer speed growth; upgrades add
-- plots, cut grow time, boost seed-finding, raise the daily petting cap, and improve harvest-chest luck.

-- Seed bag (one row per seed type held).
CREATE TABLE IF NOT EXISTS mkt_farm_seed (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    seed_id  TEXT NOT NULL,
    count    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, seed_id)
);

-- One row per OCCUPIED plot (empty plots have no row). slot is 0..(plots-1).
CREATE TABLE IF NOT EXISTS mkt_farm_plot (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    slot       INT  NOT NULL,
    seed_id    TEXT NOT NULL,
    planted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ready_at   TIMESTAMPTZ NOT NULL,
    fertilized BOOLEAN NOT NULL DEFAULT FALSE,
    rain_at    TIMESTAMPTZ,
    UNIQUE (buyer_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_farm_plot_ready ON mkt_farm_plot (ready_at);

-- Per-member upgrades + fertilizer stock. farm_upgrades = { plots, grow, seedluck, petcap, chest } (all int levels).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_upgrades   JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_fertilizer INT   NOT NULL DEFAULT 0;
