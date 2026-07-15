-- Scan-to-earn loyalty claims. When an in-store sale can't be auto-matched to an account, we mint a
-- single-use claim for that Square payment and push it to staff phones; the staff show its QR, the
-- customer scans it with their own phone and (once signed in) the payment's XP lands on their account.
-- One claim per payment (webhook retries reuse it); short-lived so a stray QR can't be claimed later.
CREATE TABLE IF NOT EXISTS mkt_loyalty_claim (
    token TEXT PRIMARY KEY,
    square_payment_id TEXT NOT NULL,
    award_order_id TEXT NOT NULL,      -- the dedupe id passed to awardPurchaseXp (e.g. "sq:<orderId>")
    amount_cents INTEGER NOT NULL DEFAULT 0,
    location_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ,
    redeemed_buyer_id UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_loyalty_claim_payment ON mkt_loyalty_claim (square_payment_id);
