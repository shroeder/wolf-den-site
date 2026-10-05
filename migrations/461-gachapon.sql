-- ── THE HALLOWE'EN GACHAPON ──────────────────────────────────────────────────────────────────────────────
-- One row per capsule that came down the chute. This is the GAME's record of a pull; a credit win is also
-- written to mkt_store_credit_event by addCredit, which is the MONEY's record, and the two must agree —
-- scripts/gachapon-odds.mjs reconciles them.
--
-- `cents` is 0 for everything that is not store credit, so "what has this machine cost" is one SUM over one
-- column rather than a join against the pool definition in a JS file.
CREATE TABLE IF NOT EXISTS mkt_gacha_pull (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    prize_id    TEXT NOT NULL,
    capsule     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    cents       INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gacha_pull_buyer ON mkt_gacha_pull (buyer_id, created_at DESC);
-- The money question — "what has it paid out this month" — is a range scan over the paying rows only.
CREATE INDEX IF NOT EXISTS idx_gacha_pull_cents ON mkt_gacha_pull (created_at) WHERE cents > 0;
