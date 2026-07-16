-- The monthly BOSS EVENT: one shared, persistent boss the whole community chips away at. HP is real and
-- shared across all members (not a browser sim). Each swing is a boss_hit (also the daily-limit +
-- contribution + reward source). When HP hits 0 the boss is marked defeated; a tougher one auto-spawns.
CREATE TABLE IF NOT EXISTS boss_event (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT 'dragon',
    tier        INT NOT NULL DEFAULT 1,
    max_hp      INT NOT NULL,
    hp          INT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    defeated_at TIMESTAMPTZ,
    defeated_by UUID
);

CREATE TABLE IF NOT EXISTS boss_hit (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boss_id    UUID NOT NULL REFERENCES boss_event(id) ON DELETE CASCADE,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    damage     INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS boss_hit_boss_idx ON boss_hit (boss_id);
CREATE INDEX IF NOT EXISTS boss_hit_buyer_idx ON boss_hit (buyer_id);
CREATE INDEX IF NOT EXISTS boss_hit_buyer_day_idx ON boss_hit (buyer_id, created_at);

-- Seed the first boss if none is active.
INSERT INTO boss_event (name, icon, tier, max_hp, hp)
SELECT 'Ancient Wyrm', 'dragon', 1, 10000, 10000
WHERE NOT EXISTS (SELECT 1 FROM boss_event WHERE defeated_at IS NULL);

-- Boss participation badges (auto-earned, driven by boss_hit stats in getMemberMetrics).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('boss_challenger', 'Challenger',  'Struck the monthly boss',    '⚔️', '#c0553a', FALSE, 'boss_hits',   1,    140),
    ('boss_raider',     'Raider',      'Landed 25 hits on the boss', '🗡️', '#b8433a', FALSE, 'boss_hits',   25,   141),
    ('boss_slayer',     'Boss Slayer', 'Dealt 5,000 boss damage',    '🐉', '#e0443a', FALSE, 'boss_damage', 5000, 142)
ON CONFLICT (slug) DO NOTHING;
