-- ── SELLING RULES PER PRODUCT: PICKUP-ONLY, AND A LIMIT PER CUSTOMER ─────────────────────────────────────
-- Luke: "we have all these items we got from distribution that we're selling for like really competitive
-- prices and I don't want bots to buy them all out ... I really want to leverage these competitive prices to
-- get real customers coming in the door."
--
-- Two independent flags. A product can carry either, both, or neither.
--
-- ⚠️ A SEPARATE TABLE RATHER THAN COLUMNS ON inventory_feed. The feed is a MIRROR of Square: the reconcile
-- upserts it from the catalogue and treats Square as the truth. Rules are the opposite — they are ours, Square
-- has never heard of them, and a resync must not be able to clear them. Keyed on the same variation_id so the
-- two line up, but owned by us.
CREATE TABLE IF NOT EXISTS shop_item_rules (
    variation_id        TEXT        PRIMARY KEY,
    pickup_only         BOOLEAN     NOT NULL DEFAULT FALSE,
    -- NULL = no limit. 1 is the case this was built for.
    limit_per_customer  INTEGER,
    -- ── THE RUN ─────────────────────────────────────────────────────────────────────────────────────
    -- Luke, asked how long "one per customer" lasts: "For the existing quantity initially stocked."
    --
    -- So the limit is not lifetime and it is not a rolling window — it belongs to the BATCH OF STOCK ON THE
    -- SHELF. Twenty ETBs means twenty different customers. When more arrive, that is a new batch and everyone
    -- is eligible again, because a customer who bought one in October is not a bot for wanting one in
    -- December.
    --
    -- Every limit check and every claim is scoped to this timestamp, so starting a new run is one write and
    -- costs nothing: the old claims simply stop matching.
    run_started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_qty             INTEGER,              -- stock on hand when the run began, for the admin screen only
    -- Cached off Square so the admin list can name a product without a catalogue read per row.
    item_name           TEXT,
    note                TEXT,
    updated_by          TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only rules that actually do something need listing in the app.
CREATE INDEX IF NOT EXISTS idx_shop_item_rules_active
    ON shop_item_rules (updated_at DESC)
    WHERE pickup_only = TRUE OR limit_per_customer IS NOT NULL;

-- ── THE CLAIM LEDGER ─────────────────────────────────────────────────────────────────────────────────────
-- One row per identifying signal per purchase of a limited product.
--
-- ⚠️ THE PRIMARY KEY IS THE ENFORCEMENT, NOT A SELECT. This driver has no transactions (see CLAUDE.md), so a
-- count-then-insert leaves a window where two orders a few milliseconds apart both read "zero so far" and both
-- go through — which is precisely the shape a bot generates. Inserting the claim and letting the PRIMARY KEY
-- refuse the duplicate is one statement and has no window at all.
--
-- `slot` is which of the N allowed purchases this is, so a limit above 1 works the same way. At limit 1 it is
-- always 0, which makes the common case exactly a uniqueness constraint.
--
-- One row PER SIGNAL because a bot varies them one at a time: a fresh Gmail alias but the same card, or a new
-- card but the same shipping address. Any single collision is a repeat buyer.
CREATE TABLE IF NOT EXISTS shop_item_claims (
    variation_id    TEXT        NOT NULL,
    run_started_at  TIMESTAMPTZ NOT NULL,
    signal_kind     TEXT        NOT NULL,   -- account | email | phone | address | ip | card
    signal_value    TEXT        NOT NULL,   -- already normalised (see shop-item-rules.js)
    slot            INTEGER     NOT NULL DEFAULT 0,
    order_id        UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (variation_id, run_started_at, signal_kind, signal_value, slot)
);

-- Releasing a claim when a payment fails or an order is cancelled is a lookup by order.
CREATE INDEX IF NOT EXISTS idx_shop_item_claims_order ON shop_item_claims (order_id);

-- ── THE TWO SIGNALS WE DID NOT ALREADY KEEP ──────────────────────────────────────────────────────────────
-- Orders already carry the account, the email, the phone and the shipping address. These two are new.
--
-- ⚠️ card_fingerprint IS THE STRONGEST SIGNAL HERE AND IT IS NOT A CARD NUMBER. Square returns a stable
-- opaque hash per card; it cannot be reversed and it cannot be charged. It matters because an email is free
-- and infinite, a residential proxy is cheap, but every order has to be paid for by something, and a bot
-- farm running one card across fifty checkouts collides on the first one.
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS order_ip         TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;

-- Why an order was marked for a human to look at. Today the only value is 'duplicate_card'.
-- ⚠️ A FLAG, NOT A BLOCK. See recordCardSignal in shop-item-rules.js for why the card cannot refuse an order.
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS rule_flag TEXT;
