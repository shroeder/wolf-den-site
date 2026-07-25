-- In-store STORE-CREDIT redemptions detected from a Square custom tender. Store credit is entered at the
-- register as a custom payment type (tender), not a line item; the Square payment webhook detects it and,
-- when the member is identifiable, auto-deducts it from their balance (ledger reason "spend_store", ref
-- sc:<order_id>) so the ledger stays truthful. This table is the per-order idempotency guard: Square resends
-- payment.created/updated (repeatedly), so we must fire the alert + deduct EXACTLY ONCE per order. It also
-- dedupes the WALK-IN case (no linked customer) where nothing is written to the buyer-scoped ledger — the
-- append-only mkt_store_credit_event needs a NON-NULL buyer_id, so it can't record an unidentified redemption.
CREATE TABLE IF NOT EXISTS mkt_store_credit_redeem (
    order_id     TEXT PRIMARY KEY,                                  -- Square order id (dedupe key; ledger ref is sc:<order_id>)
    buyer_id     UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,  -- member if identified from the sale, else NULL
    amount_cents INT NOT NULL,                                      -- store-credit portion of the sale, in cents
    deducted     BOOLEAN NOT NULL DEFAULT FALSE,                    -- whether we auto-deducted from the member's balance
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
