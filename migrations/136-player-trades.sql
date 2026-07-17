-- Player-to-player trade offers: each side can put up items + gold. The proposer's offered GOLD is
-- escrowed (deducted) while pending; items are validated + transferred at accept time. Charged items
-- carry their remaining charges when they move.
CREATE TABLE IF NOT EXISTS mkt_trade_offer (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    to_buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    offered_items   JSONB NOT NULL DEFAULT '[]',   -- item ids the proposer gives
    offered_gold    INT  NOT NULL DEFAULT 0,        -- escrowed from the proposer on propose
    requested_items JSONB NOT NULL DEFAULT '[]',   -- item ids requested from the recipient
    requested_gold  INT  NOT NULL DEFAULT 0,
    note            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | cancelled | expired
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 days',
    resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mkt_trade_offer_to ON mkt_trade_offer(to_buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_trade_offer_from ON mkt_trade_offer(from_buyer_id, status);
