-- Add mystery bag singles inventory tracking
CREATE TABLE IF NOT EXISTS mystery_bag_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id TEXT NOT NULL UNIQUE,
    card_name TEXT NOT NULL,
    set_name TEXT NOT NULL,
    card_number TEXT NOT NULL,
    market_value NUMERIC(12, 2) NOT NULL CHECK (market_value >= 0),
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_market_value ON mystery_bag_cards(market_value DESC);
CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_created_at ON mystery_bag_cards(created_at DESC);
