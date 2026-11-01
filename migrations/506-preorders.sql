-- ── PRE-ORDERS: SELL IT BEFORE IT IS IN THE BUILDING ───────────────────────────────────────────────────────
-- Luke: "when we're restocking an item, you can mark it as pre-release and set the expected arrival date...
-- it'll be an item in Square, just like every other one... people can order it online... and they can ship or
-- do local pickup. But there's going to be text making it clear both when they're ordering and when they get
-- the confirmation email that the item is not going to be shipped until the expected arrival date."
--
-- ⚠️ THIS IS NOT pickup_only AND IT IS NOT limit_per_customer. Luke said so twice, unprompted, and it is
-- worth writing down because the three will sit in the same table and the same admin screen: a pre-order
-- ships anywhere, to anyone, in any quantity. The only thing it changes is WHEN.
--
-- It lives in shop_item_rules for the reason that table exists at all -- it is OURS, keyed on Square's
-- variation id, and a catalogue resync cannot clear it. Square has no concept of "arriving on the 14th".
ALTER TABLE shop_item_rules ADD COLUMN IF NOT EXISTS preorder_arrives_on  DATE;
ALTER TABLE shop_item_rules ADD COLUMN IF NOT EXISTS preorder_arrived_at  TIMESTAMPTZ;
-- What the Square item was called before "Pre-Order" was baked into the name, so arrival can put it back
-- exactly rather than by string-surgery on whatever it is called by then.
ALTER TABLE shop_item_rules ADD COLUMN IF NOT EXISTS preorder_base_name   TEXT;

-- ⚠️ A PRE-ORDER IS LIVE WHEN THE DATE IS SET AND ARRIVAL IS NOT. Not "date in the future": a shipment that
-- is three days late is still a pre-order, the customers are still waiting, and the storefront must still
-- say so. Only marking it arrived ends it. Every query in shop-item-rules.js uses exactly this test.
CREATE INDEX IF NOT EXISTS idx_shop_item_rules_preorder
    ON shop_item_rules (preorder_arrives_on)
    WHERE preorder_arrives_on IS NOT NULL AND preorder_arrived_at IS NULL;

-- ── WHO IS WAITING, AND HAVE THEY BEEN TOLD ────────────────────────────────────────────────────────────────
-- One row per (order, variation) the moment a pre-order is paid for. It could be derived by scanning
-- items_json on every order, and that is exactly what it must not be: the arrival email has to go to each
-- customer EXACTLY ONCE, and "did we already email this person" is not answerable from a JSON scan.
--
-- ⚠️ THE PRIMARY KEY IS THE GUARD, the same shape the claim ledger uses two tables over, and for the same
-- reason: this driver has no transactions (see CLAUDE.md), so uniqueness is the only safe lock. Marking an
-- item arrived twice -- a double tap, two staff, a retry -- must not send two emails.
CREATE TABLE IF NOT EXISTS shop_preorder_holds (
    order_id      TEXT        NOT NULL,
    variation_id  TEXT        NOT NULL,
    item_name     TEXT,
    quantity      INTEGER     NOT NULL DEFAULT 1,
    notified_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, variation_id)
);

-- The arrival screen asks one question: who is holding THIS item and has not been told yet.
CREATE INDEX IF NOT EXISTS idx_shop_preorder_holds_pending
    ON shop_preorder_holds (variation_id)
    WHERE notified_at IS NULL;
