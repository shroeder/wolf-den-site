-- ── THE MARKET ───────────────────────────────────────────────────────────────────────────────────────────────
-- Member-to-member trade in what the land actually produces: crops, fish and prepped ingredients, for gold.
-- Sunflower Jinxx asked for it first in global chat ("trade/sell prepped food to people... so many people have
-- said they have a cool recipe, but not the prepable required thing"), seconded by Kaishiern hours later. It
-- only makes sense now that cooking's jackpot rate has come down fivefold — a market is worth nothing if the
-- goods it trades are falling out of the sky.
--
-- ESCROW, NOT A PROMISE. `qty` moves OUT of the seller's pantry the moment a listing is posted and lives on
-- this row until it is bought or cancelled. Anything else lets a member list the same three Starfruit five
-- times and eat them while the offers sit there — and neon()'s HTTP driver has NO TRANSACTIONS, so there is no
-- read-then-write that can be trusted to hold. Every state change here is a single guarded UPDATE.
CREATE TABLE IF NOT EXISTS mkt_market_listing (
    id           BIGSERIAL PRIMARY KEY,
    seller_id    UUID        NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    kind         TEXT        NOT NULL,          -- pantry kind: crop | fish | prep
    ref          TEXT        NOT NULL,          -- the item id within that kind
    qty          INTEGER     NOT NULL CHECK (qty > 0),
    unit_gold    INTEGER     NOT NULL CHECK (unit_gold > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Set together, always. A listing is open while `sold_at` and `cancelled_at` are both null; the partial
    -- index below is what makes "still open" cheap to ask for.
    buyer_id     UUID        REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    sold_at      TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- The stall front: everything still for sale, cheapest first. Partial so the index stays small as sold rows
-- accumulate — the history is worth keeping and nobody browses it.
CREATE INDEX IF NOT EXISTS mkt_market_open_idx
    ON mkt_market_listing (kind, ref, unit_gold)
    WHERE sold_at IS NULL AND cancelled_at IS NULL;

-- "What am I selling", and the guard against a member flooding the board.
CREATE INDEX IF NOT EXISTS mkt_market_seller_idx
    ON mkt_market_listing (seller_id)
    WHERE sold_at IS NULL AND cancelled_at IS NULL;
