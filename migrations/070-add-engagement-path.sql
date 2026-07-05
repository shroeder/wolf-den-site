-- Broaden the engagement log into site-wide telemetry: add a `path` so page views across the whole
-- site (not just marketplace actions) can be recorded, for feature-usage visibility in the admin app.

ALTER TABLE mkt_engagement ADD COLUMN IF NOT EXISTS path TEXT;
CREATE INDEX IF NOT EXISTS idx_mkt_engagement_path ON mkt_engagement (path) WHERE path IS NOT NULL;
