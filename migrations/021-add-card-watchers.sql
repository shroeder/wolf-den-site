-- Persistent "Looking For" wishlists. A watcher is an anonymous visitor (identified by a
-- signed cookie) that can optionally attach a verified email for restock alerts, and can be
-- linked to a shop customer account once logins leave alpha.
CREATE TABLE IF NOT EXISTS card_watchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    email_normalized TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verify_token_hash TEXT,
    verify_sent_at TIMESTAMPTZ,
    customer_id UUID REFERENCES shop_customer_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_watchers_email_normalized ON card_watchers(email_normalized);
CREATE INDEX IF NOT EXISTS idx_card_watchers_customer_id ON card_watchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_card_watchers_verify_token_hash ON card_watchers(verify_token_hash);

CREATE TABLE IF NOT EXISTS card_watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watcher_id UUID NOT NULL REFERENCES card_watchers(id) ON DELETE CASCADE,
    card_id BIGINT NOT NULL REFERENCES tcg_cards(id) ON DELETE CASCADE,
    notified_in_stock BOOLEAN NOT NULL DEFAULT FALSE,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (watcher_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_watchlist_items_watcher_id ON card_watchlist_items(watcher_id);
CREATE INDEX IF NOT EXISTS idx_card_watchlist_items_card_id ON card_watchlist_items(card_id);
