-- Add recent mystery bag hit history for public display
CREATE TABLE IF NOT EXISTS mystery_bag_recent_hits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id TEXT,
    card_name TEXT NOT NULL,
    set_name TEXT NOT NULL,
    card_number TEXT NOT NULL,
    market_value NUMERIC(12, 2) NOT NULL CHECK (market_value >= 0),
    image_url TEXT,
    pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mystery_bag_recent_hits_pulled_at ON mystery_bag_recent_hits(pulled_at DESC);
CREATE INDEX IF NOT EXISTS idx_mystery_bag_recent_hits_created_at ON mystery_bag_recent_hits(created_at DESC);
