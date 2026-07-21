-- Buyable STORE CREDIT (a dollar balance tracked on the member's account, not a Square gift card) plus the
-- coins they earn for buying it. A member buys credit online through Square; the dollars land in
-- store_credit_cents and they're granted 1 coin per cent (100 coins per $1). Credit is spendable in-store
-- (staff scan a QR + enter the amount) or applied to an online order. Everything is double-entry: the
-- balance column is the running total, mkt_store_credit_event is the append-only ledger.

ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS store_credit_cents INT NOT NULL DEFAULT 0;

-- Append-only ledger of every credit movement (purchase / in-store spend / online spend / refund / adjust).
CREATE TABLE IF NOT EXISTS mkt_store_credit_event (
    id                  BIGSERIAL PRIMARY KEY,
    buyer_id            UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    delta_cents         INT NOT NULL,               -- + for credit added, - for spent
    balance_after_cents INT NOT NULL,               -- running balance snapshot after this event
    reason              TEXT NOT NULL,              -- purchase | spend_store | spend_online | refund | adjust
    ref                 TEXT,                       -- square payment id / order id / claim token
    meta                JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_event_buyer ON mkt_store_credit_event(buyer_id, created_at DESC);

-- One row per online credit-purchase attempt. Guards against double-crediting when a charge is retried:
-- credit is only ever applied on the pending -> paid transition (single-use), keyed to the Square payment.
CREATE TABLE IF NOT EXISTS mkt_credit_purchase (
    id                UUID PRIMARY KEY,
    buyer_id          UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    amount_cents      INT NOT NULL,                 -- credit purchased (added to the balance)
    fee_cents         INT NOT NULL DEFAULT 0,       -- online processing surcharge passed to the buyer
    charged_cents     INT NOT NULL,                 -- what the card was actually charged (amount + fee)
    coins             INT NOT NULL DEFAULT 0,       -- coins granted for this purchase
    status            TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
    idempotency_key   TEXT UNIQUE,
    square_payment_id TEXT,
    receipt_url       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    credited_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_credit_purchase_buyer ON mkt_credit_purchase(buyer_id, created_at DESC);

-- In-store spend handshake (member shows QR, staff scan it in the admin app + enter the amount to deduct).
-- Mirrors mkt_charge_claim; amount_cents is filled in when staff redeem it.
CREATE TABLE IF NOT EXISTS mkt_credit_claim (
    token        TEXT PRIMARY KEY,
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    redeemed_at  TIMESTAMPTZ,
    redeemed_by  TEXT,
    amount_cents INT
);
CREATE INDEX IF NOT EXISTS idx_credit_claim_buyer ON mkt_credit_claim(buyer_id);
