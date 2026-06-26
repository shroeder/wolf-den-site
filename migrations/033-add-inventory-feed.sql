-- Unified inventory change feed: ONE source of truth for both the Discord broadcast and the website
-- "Just In" page. Replaces the tangle of product_alert_* (cron scan + email) and discord_alert_*
-- (webhook qty baseline) paths, which used different triggers/rules and disagreed with each other.
--
-- One row per variation = its current snapshot (quantity + price). A periodic reconcile diffs current
-- Square stock against this snapshot to detect new items, quantity increases, and price decreases,
-- stamps last_change_at/last_change_kind, and posts anything unposted to Discord. No price gate —
-- every changed item is included.
CREATE TABLE IF NOT EXISTS inventory_feed (
    variation_id TEXT PRIMARY KEY,
    name TEXT,
    image_url TEXT,
    price NUMERIC,
    quantity INTEGER NOT NULL DEFAULT 0,
    category_names TEXT,
    in_stock BOOLEAN NOT NULL DEFAULT FALSE,
    last_change_kind TEXT,          -- 'new' | 'restock' | 'price_drop'
    last_change_at TIMESTAMPTZ,     -- when the latest change was detected (NULL = baseline only)
    discord_posted_at TIMESTAMPTZ,  -- when that change was broadcast to Discord
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives the website feed (recent changes, in stock) and the Discord "what's unposted" query.
CREATE INDEX IF NOT EXISTS idx_inventory_feed_change
    ON inventory_feed (last_change_at DESC)
    WHERE in_stock = TRUE;

-- Single-row coordination: throttles webhook-triggered reconciles so an intake burst can't fire a
-- full catalog scan per event.
CREATE TABLE IF NOT EXISTS inventory_feed_meta (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    last_reconcile_at TIMESTAMPTZ,
    CONSTRAINT inventory_feed_meta_singleton CHECK (id IS TRUE)
);

INSERT INTO inventory_feed_meta (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
