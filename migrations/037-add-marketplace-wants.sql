-- Buyer demand signals for the marketplace: "notify me when an approved vendor lists this product."
-- Powers (a) the buyer alert — one email when a matching listing first appears — and (b) the vendor
-- "most wanted" board (aggregate demand per product). See docs/marketplace-plan.md Phase 5.

CREATE TABLE IF NOT EXISTS mkt_want (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_product_id BIGINT NOT NULL REFERENCES tcg_cards(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    notified_at TIMESTAMPTZ,                       -- set once the buyer has been told it's available
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (catalog_product_id, email_normalized)  -- one want per person per product
);

CREATE INDEX IF NOT EXISTS idx_mkt_want_product ON mkt_want (catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_mkt_want_pending ON mkt_want (catalog_product_id) WHERE notified_at IS NULL;
