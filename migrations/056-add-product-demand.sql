-- Vendor Heat Map: capture buyer demand (product-page interest) so vendors see what buyers are after
-- vs. what's stocked. Daily per-product counter (bounded — one row per product per day), not an
-- unbounded event log.

CREATE TABLE IF NOT EXISTS mkt_product_demand (
    catalog_product_id BIGINT NOT NULL,
    day DATE NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (catalog_product_id, day)
);

CREATE INDEX IF NOT EXISTS idx_product_demand_day ON mkt_product_demand (day DESC);
