-- Enrich every activity event with the visitor's device + network + location context (especially for
-- anonymous traffic). Vercel edge headers give country/region/city/lat-long/timezone + IP for free; the
-- client beacon adds screen/language/timezone/referrer/connection. No external ISP lookup (kept free).
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS device TEXT;     -- mobile / tablet / desktop / bot
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS browser TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS os TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS context JSONB;   -- lat, lon, timezone, lang, screen, viewport, referrer, connection
CREATE INDEX IF NOT EXISTS idx_activity_country ON mkt_activity_event (country, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_device ON mkt_activity_event (device, created_at DESC);

-- One rolled-up row per visitor (anonymous by anon_id, or a signed-in member): first/last seen, lifetime
-- event count, latest device + location, first-touch landing page + referrer (how they found us), and the
-- member they eventually became (if any). Lets the admin answer "who is this anonymous person?".
CREATE TABLE IF NOT EXISTS mkt_visitor (
    anon_id      TEXT PRIMARY KEY,
    buyer_id     UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    events       INT NOT NULL DEFAULT 0,
    ip           TEXT,
    user_agent   TEXT,
    device       TEXT,
    browser      TEXT,
    os           TEXT,
    country      TEXT,
    region       TEXT,
    city         TEXT,
    latitude     TEXT,
    longitude    TEXT,
    timezone     TEXT,
    lang         TEXT,
    screen       TEXT,
    landing_path TEXT,   -- first page they hit (first-touch)
    referrer     TEXT    -- first-touch referrer
);
CREATE INDEX IF NOT EXISTS idx_visitor_last_seen ON mkt_visitor (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_buyer ON mkt_visitor (buyer_id);
CREATE INDEX IF NOT EXISTS idx_visitor_country ON mkt_visitor (country);
