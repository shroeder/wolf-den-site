-- New-arrival alerts: a customer mailing list that emails subscribers when new stock (new items
-- or restocks) is scanned into Square in the product categories they follow. Modeled on the
-- "Looking For" card-watcher feature (migration 021): double opt-in verified email + cron-batched
-- digests. Categories are auto-synced from Square; arrivals are detected by diffing current Square
-- inventory against a stored per-variation snapshot.

-- Square categories the visitor can subscribe to, synced from the Square catalog. `visible` lets
-- staff hide noisy/internal categories from the public signup form without deleting them.
CREATE TABLE IF NOT EXISTS product_alert_categories (
    square_category_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A mailing-list subscriber, identified by email (no anonymous cookie — unlike watchers, the list
-- is keyed on the verified address itself). Double opt-in via a hashed verify token; unsubscribe
-- via a stable per-subscriber token embedded in every email.
CREATE TABLE IF NOT EXISTS product_alert_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verify_token_hash TEXT,
    verify_sent_at TIMESTAMPTZ,
    unsubscribe_token TEXT NOT NULL UNIQUE,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_alert_subscribers_verify_token_hash
    ON product_alert_subscribers(verify_token_hash);

-- Which categories each subscriber follows.
CREATE TABLE IF NOT EXISTS product_alert_subscriptions (
    subscriber_id UUID NOT NULL REFERENCES product_alert_subscribers(id) ON DELETE CASCADE,
    square_category_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subscriber_id, square_category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_alert_subscriptions_category
    ON product_alert_subscriptions(square_category_id);

-- Per-variation in-stock baseline used to detect transitions. A variation flipping from
-- absent/out-of-stock to in-stock is an arrival: `new` if never seen before, `restock` otherwise.
CREATE TABLE IF NOT EXISTS product_alert_inventory_state (
    variation_id TEXT PRIMARY KEY,
    item_name TEXT,
    in_stock BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Detected arrivals, the source for digests. One row per (variation, category) so subscribers to
-- any category the item belongs to get alerted. Digests select arrivals newer than a subscriber's
-- last_notified_at, so the same arrival never double-sends.
CREATE TABLE IF NOT EXISTS product_alert_arrivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    square_category_id TEXT NOT NULL,
    variation_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('new', 'restock')),
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_alert_arrivals_category_created
    ON product_alert_arrivals(square_category_id, created_at);

-- Single-row coordination state. The Square webhook sets dirty=TRUE on inventory/catalog changes;
-- the cron consumes the flag to run a prompt scan, collapsing intake bursts into one digest.
CREATE TABLE IF NOT EXISTS product_alert_state (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    dirty BOOLEAN NOT NULL DEFAULT FALSE,
    dirty_since TIMESTAMPTZ,
    last_scan_at TIMESTAMPTZ,
    last_digest_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_alert_state_singleton CHECK (id IS TRUE)
);

INSERT INTO product_alert_state (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
