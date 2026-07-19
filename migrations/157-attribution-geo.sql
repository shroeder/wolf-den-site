-- First-touch acquisition attribution (how each visitor found us) + precise opt-in geolocation, layered
-- onto the per-visitor rollup. UTM/click ids come from the landing URL; source_kind is a coarse bucket
-- (paid / social / search / email / referral / direct). geo_* is set only when a member grants the browser
-- location permission (far more precise than IP geo).
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS utm_source   TEXT;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS utm_term     TEXT;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS utm_content  TEXT;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS click_id     TEXT;   -- gclid / fbclid / msclkid
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS source_kind  TEXT;   -- paid / social / search / email / referral / direct
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS geo_lat      DOUBLE PRECISION;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS geo_lng      DOUBLE PRECISION;
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS geo_accuracy DOUBLE PRECISION;   -- meters
ALTER TABLE mkt_visitor ADD COLUMN IF NOT EXISTS geo_at       TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_visitor_utm_source ON mkt_visitor (utm_source);
CREATE INDEX IF NOT EXISTS idx_visitor_source_kind ON mkt_visitor (source_kind);
