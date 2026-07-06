-- Demand heatmap: capture the approximate lat/lng of each engagement event (Vercel edge geo gives
-- city-level coordinates) so the marketplace map can render where demand is coming from.

ALTER TABLE mkt_engagement ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE mkt_engagement ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_mkt_engagement_coords ON mkt_engagement (created_at) WHERE lat IS NOT NULL;
