-- Owner-gated Auction House: members list unused gear at a price, others browse + buy.
-- 5% listing fee (gold sink), 1/3/5/7-day durations. Listing removes the item from the seller's inventory;
-- a sale grants it to the buyer; an expiry/cancel returns it to the seller.
CREATE TABLE IF NOT EXISTS mkt_auction (
    id          BIGSERIAL PRIMARY KEY,
    seller_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    price       INTEGER NOT NULL,
    fee         INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'active',   -- active | sold | expired | cancelled
    buyer_id    UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    listed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    sold_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mkt_auction_active ON mkt_auction (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_mkt_auction_seller ON mkt_auction (seller_id);
