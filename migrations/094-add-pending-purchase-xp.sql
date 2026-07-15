-- "Credit waiting for you." When an in-store (or online) purchase can't be matched to a marketplace
-- account yet — because the buyer hasn't registered — we park the purchase here, keyed by email. The
-- moment they create an account with that email, the parked purchases are replayed into real XP and the
-- account is linked to its Square customer. Deduped by (email, order) so webhook retries never stack.
CREATE TABLE IF NOT EXISTS mkt_pending_purchase (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_normalized TEXT NOT NULL,
    order_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    square_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ,
    redeemed_buyer_id UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_pending_purchase_dedupe ON mkt_pending_purchase (email_normalized, order_id);
CREATE INDEX IF NOT EXISTS idx_mkt_pending_purchase_unclaimed ON mkt_pending_purchase (email_normalized) WHERE redeemed_at IS NULL;
