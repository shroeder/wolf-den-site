-- Per-owner elemental affinity OVERRIDE for gear (the Forge's "Attune" reforge). Default (no row) = the item's
-- deterministic base element (boss-weakness.js itemElement). A row overrides it to one element, or TWO on a rare
-- dual-affinity proc. Rides with the item on trade/auction (transferItemElement).
CREATE TABLE IF NOT EXISTS mkt_item_element (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id    TEXT NOT NULL,
    elements   JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["fire"] or dual ["fire","water"]
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, item_id)
);
