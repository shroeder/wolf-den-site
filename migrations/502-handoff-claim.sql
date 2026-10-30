-- ── THE CODE A MEMBER SHOWS AT THE COUNTER ──────────────────────────────────────────────────────────────────
-- Luke: "there should be a QR code the customer can pull up from their card vault. And then the admin or
-- employee app, you can scan it with the camera and it'll open it up to that person's card vault so you can
-- clear it out for them. And the same is true for online orders."
--
-- ⚠️ A TOKEN, NOT AN ID. The obvious shortcut is to put the buyer id or the order id straight in the QR and
-- skip this table. Two reasons not to: a QR is photographable by anyone standing nearby and a raw id is
-- forever, whereas this expires; and an id in a QR is an id that leaks into screenshots, support threads and
-- printed receipts. The same reasoning already produced mkt_credit_claim, and this is deliberately its shape
-- so staff and members meet one idea rather than two.
--
-- ⚠️ ONE TABLE FOR BOTH KINDS. A vault hand-over and an order pickup are the same gesture -- member shows a
-- code, staff scan it, the app opens the right screen -- and splitting them would mean two mint endpoints,
-- two resolve endpoints and two App Link branches to keep in step.
CREATE TABLE IF NOT EXISTS mkt_handoff_claim (
    token       TEXT PRIMARY KEY,
    -- 'vault' or 'order'. Checked in the app rather than constrained here: a kind the server does not know
    -- should fail the lookup, not refuse the insert of a row nobody can mint anyway.
    kind        TEXT NOT NULL,
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    -- Null for a vault claim; the order for an order claim.
    order_id    UUID,
    expires_at  TIMESTAMPTZ NOT NULL,
    -- ⚠️ RECORDED, NOT ENFORCED. Unlike a credit claim this code SPENDS nothing -- it only opens a screen,
    -- and every action behind that screen is separately admin-authenticated. Burning it on first scan would
    -- mean a member whose phone staff fumbled has to re-generate before a second try. Kept so "who scanned
    -- this and when" is answerable.
    scanned_at  TIMESTAMPTZ,
    scanned_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The member's live claim, for the re-tap path: showing the QR twice in a row must not mint a second code.
CREATE INDEX IF NOT EXISTS mkt_handoff_claim_live_idx
    ON mkt_handoff_claim (buyer_id, kind, expires_at DESC);
