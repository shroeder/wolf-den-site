-- Maps a Square item (barcode/custom SKU, no TCG- SKU) to its TCGplayer catalog product, set when the
-- owner approves an AI match in the admin app. Lets the marketplace sync include sealed/accessories
-- that otherwise have no catalog identity — without altering the Square item's SKU (keeps its barcode).
CREATE TABLE IF NOT EXISTS mkt_square_binding (
    square_item_id TEXT PRIMARY KEY,
    catalog_product_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_square_binding_product ON mkt_square_binding (catalog_product_id);
