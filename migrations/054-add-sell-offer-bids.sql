-- Shared Buylist: structured vendor offers (bids) on a seller's /get-offers post, so the seller gets
-- real numbers to compare and choose from (vs. only freeform emails). Negotiation stays identified
-- email relay; this records the offer.

CREATE TABLE IF NOT EXISTS sell_offer_bid (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sell_offer_id UUID NOT NULL REFERENCES sell_offer(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | withdrawn
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sell_offer_id, vendor_id)          -- one live bid per vendor per post (re-submit updates it)
);

CREATE INDEX IF NOT EXISTS idx_sell_offer_bid_offer ON sell_offer_bid (sell_offer_id);
CREATE INDEX IF NOT EXISTS idx_sell_offer_bid_vendor ON sell_offer_bid (vendor_id);
