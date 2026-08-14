-- ── A TRADE SETTLED INSIDE A SQUARE SALE ─────────────────────────────────────────────────────────────────────
-- The scenario the ledger could not express: a customer trades cards in, takes MORE value in cards, and pays
-- the difference. The phone app cannot take a card payment, so the money is collected on the Square POS after
-- the trade is already written. Staff had no honest way to record that, so they recorded a CASH payout — and
-- Cash On Hand then expected an outflow that never happened. Three trades were wrong this way ($49.39, $16.55,
-- $5.15); the first is corrected, the other two are flagged for review.
--
-- `applied_total` is a FOURTH kind of payout, not a synonym for credit_total. Store credit is a balance the
-- customer keeps; this value never became a balance — it was tendered against a sale and consumed on the spot.
-- Recording it as credit would leave a liability on the books that nobody can ever redeem.
ALTER TABLE trade ADD COLUMN IF NOT EXISTS applied_total NUMERIC NOT NULL DEFAULT 0;

-- The link to the sale that settled it. Null while the sale has not happened yet or has not been matched —
-- which is the ordinary state for a few minutes, because SQUARE HAPPENS AFTER THE TRADE IS SAVED. That is
-- exactly why the trade must not claim a payout it cannot yet evidence: with applied_total set and no order id,
-- the books are already correct and the link is merely missing.
ALTER TABLE trade ADD COLUMN IF NOT EXISTS square_order_id TEXT;
ALTER TABLE trade ADD COLUMN IF NOT EXISTS square_matched_at TIMESTAMPTZ;

-- Set when the matcher finds a Square sale that contradicts what the trade says it paid out — a recorded CASH
-- payout whose amount turns up as an OTHER tender on a sale minutes later. Holds the candidate order id so a
-- human can confirm rather than the job silently rewriting somebody's books.
ALTER TABLE trade ADD COLUMN IF NOT EXISTS review_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_trade_unmatched
    ON trade (traded_at DESC)
    WHERE square_order_id IS NULL AND (applied_total > 0 OR cash_total > 0);
