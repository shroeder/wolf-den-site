-- Auction House badges. Deliberately NOT easy — they take real trading activity to earn.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('auction_seller',   'Auctioneer',       'Sold 5 items on the Auction House.',                       '🔨', '#ffd75e', FALSE, 'auction_sales',    5,    FALSE, 630),
    ('auction_buyer',    'Savvy Bidder',     'Won 10 items on the Auction House.',                       '🛍️', '#4aa3ff', FALSE, 'auction_buys',     10,   FALSE, 631),
    ('auction_windfall', 'Windfall',         'Sold a single item for 5,000 gold or more.',               '💰', '#8fe39a', FALSE, 'auction_top_sale', 5000, FALSE, 632),
    ('auction_magnate',  'Auction Magnate',  'Sold 25 items on the Auction House.',                      '🏛️', '#b878ff', FALSE, 'auction_sales',    25,   TRUE,  633),
    ('auction_tycoon',   'Market Tycoon',    'Sold 100 items on the Auction House — a true market maker.','👑', '#ff7a3c', FALSE, 'auction_sales',    100,  TRUE,  634)
ON CONFLICT (slug) DO NOTHING;
