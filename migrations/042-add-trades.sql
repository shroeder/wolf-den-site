-- Trade ledger, migrated off Google Sheets into the shared DB so the app works for more than one
-- person (a helper's phone hits the same cloud ledger instead of Luke's personal spreadsheet).
-- Replaces the flat "Trades" tab (rows tagged IN/OUT/CASH/CASH_IN/GIFT_CARD/SUMMARY, totals packed
-- into a Notes cell) with structured data: one `trade` header + child `trade_line` rows.

CREATE TABLE IF NOT EXISTS trade (
    id TEXT PRIMARY KEY,                              -- the app's cart-hash trade id ("trade-<sha>"); idempotency key
    traded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    buy_rate_percent NUMERIC(6, 2),
    market_total NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- the SUMMARY row's packed totals become real columns
    offer_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    credit_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cash_total NUMERIC(12, 2) NOT NULL DEFAULT 0,     -- cash paid OUT to the customer
    gift_card_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cash_in_total NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- cash collected FROM the customer
    net_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by TEXT,                                  -- who recorded it (for the multi-user/helper case)
    source TEXT NOT NULL DEFAULT 'app',               -- 'app' | 'sheets-import'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_line (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id TEXT NOT NULL REFERENCES trade(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,                          -- IN | OUT | CASH | CASH_IN | GIFT_CARD
    item_name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_market NUMERIC(12, 2),
    line_total NUMERIC(12, 2),
    buy_rate_percent NUMERIC(6, 2),
    notes TEXT,
    -- Richer fidelity than the sheet kept (it dropped these / re-derived image at runtime):
    square_item_id TEXT,
    square_variation_id TEXT,
    set_name TEXT,
    card_number TEXT,
    condition TEXT,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_traded_at ON trade (traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_line_trade ON trade_line (trade_id);
