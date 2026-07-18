-- Remembers gear a member has SOLD back for gold. Needed because 'level' gear is auto-granted on level-up
-- (syncLevelItems); without this, selling a starter item would silently re-grant it for free — an infinite
-- gold farm. syncLevelItems skips anything recorded here.
CREATE TABLE IF NOT EXISTS mkt_sold_item (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id  TEXT NOT NULL,
    sold_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, item_id)
);
