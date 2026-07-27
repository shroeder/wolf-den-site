-- Audit ledger for creation tokens (custom_deco_credits). Every balance change — purchases, admin/owner gifts,
-- spends, refunds — writes a row here so a "gifted creation" is never a mystery again: we can always see WHO
-- granted tokens to WHOM, how many, from what source, and when. (Before this, grants only hit the console log
-- stream, so a past grant like Eric's could not be traced from the database.)
CREATE TABLE IF NOT EXISTS mkt_creation_ledger (
    id            BIGSERIAL PRIMARY KEY,
    buyer_id      UUID NOT NULL,               -- whose token balance changed
    delta         INTEGER NOT NULL,            -- +granted / -spent
    balance_after INTEGER,                     -- resulting balance (best-effort; NULL if unknown)
    source        TEXT NOT NULL,               -- purchase | admin_grant | owner_grant | spend_deco | spend_farm_bg | refund_deco | refund_farm_bg
    actor_id      TEXT,                         -- who caused it: buyer id, admin user id, or 'system'
    actor_label   TEXT,                         -- human label: admin email/name, 'self (paid)', 'owner test', 'system'
    meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mkt_creation_ledger_buyer_idx  ON mkt_creation_ledger (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_creation_ledger_source_idx ON mkt_creation_ledger (source, created_at DESC);
-- Fast lookup of GIFTS (someone granted tokens they didn't pay for).
CREATE INDEX IF NOT EXISTS mkt_creation_ledger_gift_idx   ON mkt_creation_ledger (created_at DESC) WHERE source IN ('admin_grant', 'owner_grant');
