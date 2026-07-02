-- Community Price History: a daily snapshot of network-internal supply/pricing per catalog product,
-- so we can show trends (copies available, lowest local price) over time. Current-state stats are
-- computed live from active listings; this table is only for the over-time trend.

CREATE TABLE IF NOT EXISTS mkt_price_snapshot (
    catalog_product_id BIGINT NOT NULL,
    snapshot_date DATE NOT NULL,
    vendor_count INTEGER NOT NULL DEFAULT 0,
    copies INTEGER NOT NULL DEFAULT 0,
    avg_price NUMERIC(10, 2),
    low_price NUMERIC(10, 2),
    PRIMARY KEY (catalog_product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshot_product ON mkt_price_snapshot (catalog_product_id, snapshot_date DESC);
