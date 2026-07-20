-- Donation engagement: lifetime gold donated to Happy Hour / the rally pool (drives badges), plus the
-- donation milestone badges themselves. The rally pool + per-event contributions live in existing tables/
-- settings, so only this column + badge rows are new.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS event_gold_donated BIGINT NOT NULL DEFAULT 0;

INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('patron',        'Patron',        'Donated 5,000 gold to the pack',   '🤝', '#8fe0a0', FALSE, 'event_donated', 5000,   72),
    ('benefactor',    'Benefactor',    'Donated 25,000 gold to the pack',  '💛', '#ffd75e', FALSE, 'event_donated', 25000,  73),
    ('philanthropist','Philanthropist','Donated 100,000 gold to the pack', '👑', '#ff9a6a', FALSE, 'event_donated', 100000, 74)
ON CONFLICT (slug) DO NOTHING;
