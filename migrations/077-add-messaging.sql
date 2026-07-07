-- Owned in-platform messaging: a 1:1 conversation between a buyer account and a vendor. Replaces the
-- email hand-off for "contact seller" / "I can fill this" — email becomes only a new-message nudge.
-- Read state is per-side last-read timestamps; unread = counterpart messages newer than that.

CREATE TABLE IF NOT EXISTS mkt_thread (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    subject TEXT,                                   -- latest context, e.g. a product/listing name
    listing_id UUID,                                -- optional anchor (loose ref, no FK)
    catalog_product_id BIGINT,                      -- optional anchor
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_preview TEXT,
    last_sender TEXT,                               -- 'buyer' | 'vendor'
    buyer_last_read_at TIMESTAMPTZ,
    vendor_last_read_at TIMESTAMPTZ,
    UNIQUE (buyer_id, vendor_id)                    -- one conversation per buyer<->vendor pair
);

CREATE TABLE IF NOT EXISTS mkt_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES mkt_thread(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('buyer', 'vendor')),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_message_thread ON mkt_message (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mkt_thread_buyer ON mkt_thread (buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_thread_vendor ON mkt_thread (vendor_id, last_message_at DESC);
