-- Richer events: an optional cover image (so a listed event looks good) and coordinates (from the
-- location picker) so events can later be searched/sorted by vicinity.

ALTER TABLE mkt_event ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE mkt_event ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6);
ALTER TABLE mkt_event ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);
