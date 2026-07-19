-- Extend activity telemetry to cover NON-users (anonymous visitors) + page-view traffic, so the admin can
-- see minute-to-minute traffic across everyone and report on which pages/features get the most engagement.
ALTER TABLE mkt_activity_event ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS path TEXT;      -- page path for page_view events
ALTER TABLE mkt_activity_event ADD COLUMN IF NOT EXISTS anon_id TEXT;   -- client-generated id to group anon sessions
CREATE INDEX IF NOT EXISTS idx_activity_event_type ON mkt_activity_event (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_path ON mkt_activity_event (path, created_at DESC);
