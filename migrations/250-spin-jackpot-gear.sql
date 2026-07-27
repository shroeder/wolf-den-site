-- Prize-wheel expansion: a shared PROGRESSIVE jackpot pot (community-wide, grows with every spin, reseeds when
-- someone hits the MAJOR JACKPOT wedge) + the wheel-exclusive gear the bonus game awards.

-- Single-row community jackpot pot.
CREATE TABLE IF NOT EXISTS mkt_progressive_jackpot (
    id          INT PRIMARY KEY DEFAULT 1,
    pot         BIGINT NOT NULL DEFAULT 5000,
    last_winner UUID,
    last_won_at TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mkt_progressive_jackpot_single CHECK (id = 1)
);
INSERT INTO mkt_progressive_jackpot (id, pot) VALUES (1, 5000) ON CONFLICT (id) DO NOTHING;

-- Wheel-exclusive gear art (the bonus-game rewards) — one sprite per item id, served from public/images/spin/gear.
INSERT INTO mkt_item_sprite (item_id, url) VALUES
    ('wg_helm',     '/images/spin/gear/wg-helm.png'),
    ('wg_blade',    '/images/spin/gear/wg-blade.png'),
    ('wg_shield',   '/images/spin/gear/wg-shield.png'),
    ('wg_cloak',    '/images/spin/gear/wg-cloak.png'),
    ('wg_amulet',   '/images/spin/gear/wg-amulet.png'),
    ('wg_ring',     '/images/spin/gear/wg-gauntlet.png')
ON CONFLICT (item_id) DO UPDATE SET url = EXCLUDED.url;
