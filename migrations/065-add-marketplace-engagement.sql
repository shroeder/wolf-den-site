-- Passive engagement + demand intelligence. One row per meaningful buyer interaction, tagged with an
-- anonymous visitor id (cookie, no PII) and coarse Vercel edge geo (country/region/city — never exact).
-- Powers: unique reach, geographic engagement, and inferred demand (searches/views/wants). Pruned to a
-- rolling window by cron so it stays bounded.

CREATE TABLE IF NOT EXISTS mkt_engagement (
    id BIGSERIAL PRIMARY KEY,
    visitor_id TEXT,                       -- anonymous first-party cookie id (mkt_vid)
    kind TEXT NOT NULL,                    -- search | view | want | contact | storefront | browse
    catalog_product_id BIGINT,             -- the card, when the action is about one
    search_term TEXT,                      -- the query, for kind = search
    country TEXT,
    region TEXT,
    city TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_engagement_created ON mkt_engagement (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_engagement_kind ON mkt_engagement (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_engagement_product ON mkt_engagement (catalog_product_id) WHERE catalog_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_engagement_geo ON mkt_engagement (region, city);
