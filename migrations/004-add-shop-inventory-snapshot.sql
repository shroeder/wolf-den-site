-- Store a daily snapshot of shop inventory grouped by category
CREATE TABLE IF NOT EXISTS shop_inventory_snapshot (
    snapshot_key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
