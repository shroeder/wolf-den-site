-- Farm presence: who's currently VIEWING which farm, so you can see visitors at your farm (and see yourself
-- when you're visiting someone else's). One row per viewer — they're on at most one farm at a time.
CREATE TABLE IF NOT EXISTS mkt_farm_presence (
    viewer_id     UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    farm_owner_id UUID NOT NULL,
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_farm_presence_owner ON mkt_farm_presence (farm_owner_id, last_seen);
