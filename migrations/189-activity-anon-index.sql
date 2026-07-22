-- Fast lookup of one anonymous visitor's ordered journey (admin visitor drill-down).
CREATE INDEX IF NOT EXISTS idx_activity_anon_created ON mkt_activity_event (anon_id, created_at) WHERE anon_id IS NOT NULL;
