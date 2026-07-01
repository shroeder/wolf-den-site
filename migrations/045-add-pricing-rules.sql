-- Vendor auto-pricing. A listing can follow a rule instead of a fixed price, and a nightly job keeps
-- it current as market / competitor prices move. Vendors also get a per-account default applied to
-- new listings. See src/lib/marketplace/reprice.js (has a market-relative floor so automated
-- match-lowest can't race to zero).

ALTER TABLE mkt_listing
    ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'manual',  -- manual | market_pct | match_lowest
    ADD COLUMN IF NOT EXISTS pricing_value NUMERIC(8, 4);                  -- market_pct: fraction (0.90); match_lowest: undercut $

ALTER TABLE mkt_vendor
    ADD COLUMN IF NOT EXISTS default_pricing_mode TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS default_pricing_value NUMERIC(8, 4);

-- The nightly reprice job scans active auto-priced listings.
CREATE INDEX IF NOT EXISTS idx_mkt_listing_auto_pricing
    ON mkt_listing (pricing_mode) WHERE status = 'active' AND pricing_mode <> 'manual';
