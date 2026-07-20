-- Member-initiated charged-perk redemption. The member taps a ready charge in the app, which mints a
-- short-lived single-use claim token (nothing is burned yet); they show its QR to staff, whose admin app
-- scans it and redeems — that scan is what actually consumes the charge. Mirrors mkt_loyalty_claim, but the
-- handshake is reversed (member shows, staff scans).
CREATE TABLE IF NOT EXISTS mkt_charge_claim (
    token         TEXT PRIMARY KEY,
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id       TEXT NOT NULL,
    reward        TEXT,
    reward_label  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL,
    redeemed_at   TIMESTAMPTZ,
    redeemed_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_charge_claim_buyer ON mkt_charge_claim(buyer_id);
