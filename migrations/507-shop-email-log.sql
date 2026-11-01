-- ── WHAT WE TOLD A CUSTOMER, AND WHETHER IT LEFT THE BUILDING ──────────────────────────────────────────────
-- Luke, after watching the first store-credit order go through: the shop sends a confirmation, a ready/
-- shipped/picked-up notice, a cancellation, and now a pre-order arrival — and NOTHING anywhere records that
-- any of them happened.
--
-- So when a customer says "I never got my confirmation", the honest answer today is a shrug. You cannot tell
-- whether it was never sent, sent to the wrong address, rejected by Resend, or sitting in their spam. That is
-- bad for a $20 order and much worse for a pre-order, where the ARRIVAL email is the entire contract: the
-- customer agreed to wait weeks on the promise that we would tell them, and the only proof we would have had
-- is notified_at — a flag that says we tried, not that it landed.
--
-- ⚠️ ONE ROW PER ATTEMPT, NOT PER SUCCESS. A failure is the row that matters most; recording only the
-- successes would reproduce exactly the blind spot this table exists to remove.
CREATE TABLE IF NOT EXISTS shop_email_log (
    id           BIGSERIAL PRIMARY KEY,
    order_id     TEXT,
    -- confirmation | status_ready | status_shipped | status_picked_up | cancelled | cancel_request |
    -- new_order_alert | preorder_arrived
    kind         TEXT        NOT NULL,
    to_email     TEXT,
    subject      TEXT,
    -- Resend's own id, so a message can be found in their dashboard from a row here.
    provider_id  TEXT,
    ok           BOOLEAN     NOT NULL DEFAULT FALSE,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The two questions anyone asks: "what did this order send" and "what has failed lately".
CREATE INDEX IF NOT EXISTS idx_shop_email_log_order ON shop_email_log (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_email_log_failed ON shop_email_log (created_at DESC) WHERE ok = FALSE;
