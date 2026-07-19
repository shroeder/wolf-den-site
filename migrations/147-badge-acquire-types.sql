-- Two new badge acquisition types on top of assign (admin_only) + unlock (auto_rule):
--   • gold_price set  → PURCHASABLE with gold (badge shop)
--   • drop_only TRUE  → DROP-ONLY (earned only from a loot chest / boss kill, never bought or assigned)
ALTER TABLE mkt_badge ADD COLUMN IF NOT EXISTS gold_price INT;
ALTER TABLE mkt_badge ADD COLUMN IF NOT EXISTS drop_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Purchasable (gold) prestige badges — a pure flex, priced across the ladder.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, gold_price, sort_order) VALUES
    ('gold_hoarder', 'Gold Hoarder', 'Bought with a mountain of gold', '💰', '#d4af37', FALSE, 25000,  120),
    ('gilded',       'Gilded',       'Dripping in gold',               '✨', '#ffd75e', FALSE, 75000,  121),
    ('big_baller',   'Big Baller',   'Spent a fortune in gold',        '🤑', '#37e0a1', FALSE, 150000, 122),
    ('one_percent',  'The 1%',       'Truly, absurdly loaded',         '🎩', '#c8a24a', FALSE, 500000, 123)
ON CONFLICT (slug) DO NOTHING;

-- Drop-only badges — can ONLY be found in a loot chest or dropped by a boss. Never assignable or buyable.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, drop_only, sort_order) VALUES
    ('lucky_find',      'Lucky Find',      'Pulled from a loot chest',     '🍀', '#2fa27a', FALSE, TRUE, 130),
    ('treasure_hunter', 'Treasure Hunter', 'A rare loot-chest drop',       '🗺️', '#b0562f', FALSE, TRUE, 131),
    ('boss_relic',      'Boss Relic',      'Dropped by a slain boss',      '☠️', '#e0443a', FALSE, TRUE, 132),
    ('mythic_find',     'Mythic Find',     'The rarest drop in the Den',   '💠', '#37f5c0', FALSE, TRUE, 133)
ON CONFLICT (slug) DO NOTHING;
