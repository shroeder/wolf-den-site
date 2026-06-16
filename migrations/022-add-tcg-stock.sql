-- Snapshot of which catalog products are currently in stock in the shop (Square), keyed by
-- tcgplayer product id. Refreshed by the catalog-sync job; joined into "Looking For" search so
-- in-stock cards can be highlighted. Only in-stock products are stored.
CREATE TABLE IF NOT EXISTS tcg_stock (
    product_id BIGINT PRIMARY KEY,
    quantity INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
