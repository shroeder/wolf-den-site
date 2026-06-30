-- Sold tracking. A vendor can mark a listing sold: the listing goes status='sold' (drops out of
-- active inventory) and a snapshot row lands in mkt_sale. Unlocks the "completed sales" reputation
-- signal and is the first real transaction data for the marketplace. See docs Phase 7.

CREATE TABLE IF NOT EXISTS mkt_sale (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES mkt_listing(id) ON DELETE SET NULL,
    catalog_product_id BIGINT REFERENCES tcg_cards(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    kind TEXT,
    price NUMERIC(12, 2) NOT NULL,        -- the listed price, snapshotted
    quantity INTEGER NOT NULL DEFAULT 1,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_sale_vendor ON mkt_sale (vendor_id);
CREATE INDEX IF NOT EXISTS idx_mkt_sale_sold_at ON mkt_sale (sold_at DESC);
