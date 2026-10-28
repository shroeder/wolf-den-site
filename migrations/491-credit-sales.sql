-- ── BUYING WITH STORE CREDIT, STRAIGHT INTO THE VAULT ───────────────────────────────────────────────────────
-- Luke, 2026-10-27: "people should be able to use store credit and have the card end up in their vault
-- immediately vs only having the option to add to cart."
--
-- ⚠️ A CREDIT PURCHASE NEVER CREATES A SQUARE ORDER, so nothing in the normal sales reporting can see it.
-- The business report's scope is Square + Plaid + cash, by design. Virtual packs hit this same wall and
-- solved it with their own row (mkt_pack_open); this is the equivalent for a direct buy. Without it a card
-- leaves the building, the member is charged, and the books show absolutely nothing.
--
-- ⚠️ cogs_basis IS NOT DECORATION. 'captured' means wolfden_item_cost had a real recorded cost for this
-- variation; 'estimate_shelf_46' means we guessed at 46% of the shelf price. A margin built on a mix of the
-- two is only as good as the mix, and a report that cannot tell them apart will quote a confident number
-- that is partly invented.
CREATE TABLE IF NOT EXISTS mkt_credit_sale (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    variation_id  TEXT NOT NULL,
    item_name     TEXT,
    price_cents   INTEGER NOT NULL,
    cogs_cents    INTEGER,
    cogs_basis    TEXT,
    vault_card_id UUID,
    source        TEXT NOT NULL DEFAULT 'discover',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mkt_credit_sale_created_idx ON mkt_credit_sale (created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_credit_sale_buyer_idx ON mkt_credit_sale (buyer_id, created_at DESC);

-- ⚠️ THE VAULT NEEDS TO KNOW WHERE A CARD CAME FROM. Every row in mkt_vault_card until now arrived from a
-- pack open and carries a pack_open_id; a bought card has none, so without this column a NULL pack_open_id
-- would be the only signal and would read as a broken pack row rather than a purchase.
ALTER TABLE mkt_vault_card
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pack';
