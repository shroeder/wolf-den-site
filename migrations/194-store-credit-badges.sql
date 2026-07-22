-- Three cumulative "store credit purchased" badges ($100 / $500 / $1,000 lifetime, paid top-ups only).
-- Metric = SUM(amount_cents) of PAID mkt_credit_purchase rows (admin adjustments don't count — this is for
-- actual purchases). auto_rule 'credit_purchased' is evaluated in badges.js against dollars purchased.
INSERT INTO mkt_badge (slug, label, description, icon, color, auto_rule, auto_threshold, sort_order) VALUES
    ('credit_patron',     'Store Patron',     'Bought $100+ in store credit.',                 '💳', '#7cf5c4', 'credit_purchased', 100,  118),
    ('credit_backer',     'Store Backer',      'Bought $500+ in store credit.',                 '💰', '#ffd75e', 'credit_purchased', 500,  119),
    ('credit_benefactor', 'Store Benefactor',  'Bought $1,000+ in store credit — a true patron.', '👑', '#ff9f1c', 'credit_purchased', 1000, 120)
ON CONFLICT (slug) DO NOTHING;
