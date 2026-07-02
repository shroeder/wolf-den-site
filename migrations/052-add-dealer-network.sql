-- Dealer-to-dealer ("wholesale infrastructure"): vendors source/offload inventory between each other.
-- Layer 1 (this migration lays the full schema): dealer availability + wholesale pricing on listings,
-- plus the dealer offer/swap table used by later layers.

ALTER TABLE mkt_listing ADD COLUMN IF NOT EXISTS dealer_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mkt_listing ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_mkt_listing_dealer ON mkt_listing (dealer_available) WHERE dealer_available = TRUE;

-- A dealer's offer on another dealer's listing. Negotiation itself happens over identified email;
-- this records the structured offer + its outcome.
CREATE TABLE IF NOT EXISTS mkt_dealer_offer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES mkt_listing(id) ON DELETE CASCADE,
    from_vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,   -- the buyer/sourcer
    to_vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,     -- the listing owner
    kind TEXT NOT NULL DEFAULT 'buy',            -- buy | trade
    amount NUMERIC(10, 2),                        -- cash offer (buy)
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT,                                    -- trade terms / message to the other dealer
    status TEXT NOT NULL DEFAULT 'pending',       -- pending | accepted | declined | withdrawn
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dealer_offer_to ON mkt_dealer_offer (to_vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_dealer_offer_from ON mkt_dealer_offer (from_vendor_id, status);
