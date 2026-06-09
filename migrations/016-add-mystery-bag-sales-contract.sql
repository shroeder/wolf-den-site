ALTER TABLE mystery_bag_cards
    ADD COLUMN IF NOT EXISTS square_variation_id TEXT,
    ADD COLUMN IF NOT EXISTS pack_token TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS reservation_key TEXT,
    ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

UPDATE mystery_bag_cards
SET status = 'active'
WHERE status IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'mystery_bag_cards_status_check'
    ) THEN
        ALTER TABLE mystery_bag_cards
            ADD CONSTRAINT mystery_bag_cards_status_check
            CHECK (status IN ('active', 'reserved', 'sold', 'removed'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_bag_cards_pack_token_unique
    ON mystery_bag_cards(pack_token)
    WHERE pack_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_status
    ON mystery_bag_cards(status);

CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_square_variation_id
    ON mystery_bag_cards(square_variation_id);

CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_reservation_key
    ON mystery_bag_cards(reservation_key)
    WHERE reservation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS mystery_sold_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    square_order_id TEXT,
    square_line_item_uid TEXT,
    square_payment_id TEXT,
    sold_pack_variation_id TEXT,
    sold_pack_item_name TEXT,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mystery_sold_events_sold_at
    ON mystery_sold_events(sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_mystery_sold_events_square_order_id
    ON mystery_sold_events(square_order_id)
    WHERE square_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mystery_sold_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sold_event_id UUID NOT NULL REFERENCES mystery_sold_events(id) ON DELETE CASCADE,
    mystery_card_id UUID NOT NULL REFERENCES mystery_bag_cards(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mystery_card_id)
);

CREATE INDEX IF NOT EXISTS idx_mystery_sold_assignments_event_id
    ON mystery_sold_assignments(sold_event_id);

CREATE TABLE IF NOT EXISTS mystery_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mystery_card_id UUID REFERENCES mystery_bag_cards(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mystery_audit_log_card_id
    ON mystery_audit_log(mystery_card_id);

CREATE INDEX IF NOT EXISTS idx_mystery_audit_log_created_at
    ON mystery_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS mystery_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_id TEXT,
    idempotency_key TEXT,
    event_type TEXT,
    signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
    payload_json JSONB NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'queued',
    processing_error TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_mystery_webhook_events_status
    ON mystery_webhook_events(processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mystery_webhook_events_idempotency_key
    ON mystery_webhook_events(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
