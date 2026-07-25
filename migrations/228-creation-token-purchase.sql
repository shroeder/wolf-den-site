-- Buyable CREATION TOKENS (presented to members as "Creation Tokens"; stored on the existing
-- mkt_buyer.custom_deco_credits column). A Creation Token is spent in the farm's "Make your own" flow to
-- design an AI decoration that's yours forever + non-tradeable. Buying a tier grants TOKENS + COINS (gold) —
-- it does NOT add store credit. This table is the idempotency guard for online token purchases: tokens/coins
-- are only ever granted on the single-use pending -> paid transition, so a retried Square charge can't
-- double-grant. Mirrors mkt_credit_purchase. No new balance column is needed (custom_deco_credits + gold exist).
CREATE TABLE IF NOT EXISTS mkt_creation_purchase (
    id                UUID PRIMARY KEY,
    buyer_id          UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    tier_id           TEXT NOT NULL,                  -- config tier id (ct5 / ct10 / ct25 / ct50 / ct100)
    amount_cents      INT NOT NULL,                   -- tier price (what the card is charged; no fee added)
    tokens            INT NOT NULL DEFAULT 0,         -- creation tokens granted for this purchase
    coins             INT NOT NULL DEFAULT 0,         -- coins (gold) granted for this purchase
    status            TEXT NOT NULL DEFAULT 'pending',-- pending | paid | failed
    idempotency_key   TEXT UNIQUE,
    square_payment_id TEXT,
    receipt_url       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_creation_purchase_buyer ON mkt_creation_purchase(buyer_id, created_at DESC);
