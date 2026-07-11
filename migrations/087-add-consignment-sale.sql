-- Off-Square consignment sales.
--
-- When a consigned item leaves the shop as trade store-credit, the app decrements Square inventory
-- (IN_STOCK -> SOLD) instead of creating a Square ORDER. The consignor "owed" calculation is derived
-- purely from Square order history (searchSalesForVariations), so those trade-outs were invisible and
-- the consignor's payable was silently lost.
--
-- This table records those off-Square sales so the owed calculation (and the portal + admin app, which
-- read the same endpoints) include them. Idempotent per trade via the unique key, so an app retry or a
-- backfill never double-counts.
CREATE TABLE IF NOT EXISTS consignment_sale (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'trade',
    reference_id TEXT NOT NULL,
    square_item_id TEXT,
    square_variation_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS consignment_sale_source_ref_variation_key
    ON consignment_sale (source, reference_id, square_variation_id);

CREATE INDEX IF NOT EXISTS consignment_sale_consignor_idx
    ON consignment_sale (consignor_id);
