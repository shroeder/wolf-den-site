-- Trade rewards: when a trade is recorded in the app, we mint a single-use claim (like the loyalty QR)
-- that the trade partner scans to bank XP + record the trade to their account, which drives trade
-- badges. One claim per trade; per-buyer trade stats aggregate from the redeemed claims.
CREATE TABLE IF NOT EXISTS mkt_trade_claim (
    token TEXT PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trade(id) ON DELETE CASCADE,
    card_count INTEGER NOT NULL DEFAULT 0,          -- cards the customer traded IN
    total_value_cents INTEGER NOT NULL DEFAULT 0,   -- market value of the trade
    top_card_value_cents INTEGER NOT NULL DEFAULT 0,-- most valuable single card traded in
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    redeemed_buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_trade_claim_trade ON mkt_trade_claim (trade_id);
CREATE INDEX IF NOT EXISTS idx_mkt_trade_claim_redeemer ON mkt_trade_claim (redeemed_buyer_id) WHERE redeemed_buyer_id IS NOT NULL;

-- Trade badges (unlockable, driven by the aggregated trade stats above).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('first_trade',      'First Trade',    'Completed your first trade',            '🔄', '#7a5cff', FALSE, 'trade_count',   1,     120),
    ('trader',           'Trader',         'Completed 10 trades',                   '🔁', '#4a90d9', FALSE, 'trade_count',   10,    121),
    ('deal_maker',       'Deal Maker',     'Completed 50 trades',                   '🃏', '#c8a24a', FALSE, 'trade_count',   50,    122),
    ('trader_cards_100', 'Card Slinger',   'Traded in 100 cards',                   '🗃️', '#2f8f5b', FALSE, 'cards_traded',  100,   130),
    ('trader_cards_500', 'Card Hoarder',   'Traded in 500 cards',                   '🗄️', '#6b4f9a', FALSE, 'cards_traded',  500,   131),
    ('trade_value_500',  'Wheeler',        'Traded $500 in market value',           '📈', '#2f8f5b', FALSE, 'trade_value',   500,   140),
    ('trade_value_2k',   'Dealer',         'Traded $2,000 in market value',         '💹', '#2a6db0', FALSE, 'trade_value',   2000,  141),
    ('trade_value_10k',  'Market Mover',   'Traded $10,000 in market value',        '🏦', '#c8a24a', FALSE, 'trade_value',   10000, 142),
    ('high_roller',      'High Roller',    'Traded in a single card worth $100+',   '💎', '#8e5cff', FALSE, 'top_card',      100,   150),
    ('whale_trader',     'Grail Trader',   'Traded in a single card worth $500+',   '💠', '#d4af37', FALSE, 'top_card',      500,   151)
ON CONFLICT (slug) DO NOTHING;
