-- Inventory Swaps: two-sided barter between vendors ("my sealed for your singles"). One proposal
-- carries two baskets of listings — what the proposer gives (offer) and what they want (request) —
-- plus optional cash. The recipient approves or declines; negotiation stays identified email relay.

CREATE TABLE IF NOT EXISTS mkt_swap (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    to_vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    cash NUMERIC(10, 2),                       -- optional cash the proposer adds on top (>0)
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',     -- pending | accepted | declined | withdrawn
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mkt_swap_item (
    swap_id UUID NOT NULL REFERENCES mkt_swap(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES mkt_listing(id) ON DELETE CASCADE,
    side TEXT NOT NULL,                         -- 'offer' (from_vendor gives) | 'request' (to_vendor gives)
    PRIMARY KEY (swap_id, listing_id, side)
);

CREATE INDEX IF NOT EXISTS idx_mkt_swap_to ON mkt_swap (to_vendor_id);
CREATE INDEX IF NOT EXISTS idx_mkt_swap_from ON mkt_swap (from_vendor_id);
CREATE INDEX IF NOT EXISTS idx_mkt_swap_item_swap ON mkt_swap_item (swap_id);
