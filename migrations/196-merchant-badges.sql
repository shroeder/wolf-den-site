-- Gold Merchant event badges (direct-grant, secret until earned — same shape as the wheel 'jackpot' badge).
-- merchant_met: awarded when the Gold Merchant appears. merchant_perfect: a flawless coin-catch run (no hits).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('merchant_met',     'Gold Rush',     'Met the Gold Merchant on a far island.',           '🎩', '#ffd75e', FALSE, NULL, NULL, TRUE, 132),
    ('merchant_perfect', 'Coin Virtuoso', 'Caught a PERFECT coin toss — never took a hit.',    '🪙', '#7cffb2', FALSE, NULL, NULL, TRUE, 133)
ON CONFLICT (slug) DO NOTHING;
