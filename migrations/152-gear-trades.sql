-- Member-to-member GEAR trades: propose to swap one of another member's un-equipped items for any of your
-- own un-equipped items and/or gold. Escrow-free — ownership is re-validated at accept time and the swap
-- runs atomically then.
CREATE TABLE IF NOT EXISTS mkt_gear_trade (
    id BIGSERIAL PRIMARY KEY,
    proposer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    requested_item_id TEXT NOT NULL,               -- the target's item the proposer wants
    offered_item_ids JSONB NOT NULL DEFAULT '[]',  -- the proposer's items offered
    offered_gold INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',         -- pending | accepted | declined | cancelled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gear_trade_target ON mkt_gear_trade (target_id, status);
CREATE INDEX IF NOT EXISTS idx_gear_trade_proposer ON mkt_gear_trade (proposer_id, status);
