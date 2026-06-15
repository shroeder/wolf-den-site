-- TCG catalog ingested from tcgcsv.com (Magic + Pokemon) to power the public
-- "Looking For" card wishlist. Sets = tcgplayer groups, cards = tcgplayer products.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS tcg_sets (
    id BIGINT PRIMARY KEY,
    category_id BIGINT NOT NULL,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    abbreviation TEXT,
    published_on TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tcg_sets_game ON tcg_sets(game);

CREATE TABLE IF NOT EXISTS tcg_cards (
    id BIGINT PRIMARY KEY,
    set_id BIGINT NOT NULL REFERENCES tcg_sets(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    clean_name TEXT,
    number TEXT,
    rarity TEXT,
    image_url TEXT,
    url TEXT,
    market_price NUMERIC(12, 2),
    market_price_subtype TEXT,
    price_updated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tcg_cards_game ON tcg_cards(game);
CREATE INDEX IF NOT EXISTS idx_tcg_cards_set_id ON tcg_cards(set_id);
CREATE INDEX IF NOT EXISTS idx_tcg_cards_name_trgm ON tcg_cards USING GIN (lower(name) gin_trgm_ops);

-- Single-row tracker for the chunked tcgcsv ingestion cron. The queue column holds the
-- list of {categoryId, groupId} group refs still pending for the current source snapshot;
-- the cron drains a bounded budget per invocation.
CREATE TABLE IF NOT EXISTS tcg_ingest_state (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    source_last_updated TEXT,
    phase TEXT NOT NULL DEFAULT 'idle',
    queue JSONB NOT NULL DEFAULT '[]'::jsonb,
    queue_cursor INTEGER NOT NULL DEFAULT 0,
    sets_count INTEGER NOT NULL DEFAULT 0,
    cards_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tcg_ingest_state_singleton CHECK (id IS TRUE)
);

INSERT INTO tcg_ingest_state (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
