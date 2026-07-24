-- Raid DEFENSE: when an attacker's raid on you FAILS, you (the defender) repel it — earn a cut of what they
-- lost, a small gear chance, and a record so you see who you beat (and how much you made) when you next log in.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS raids_defended INT NOT NULL DEFAULT 0;

-- One row per repelled raid, until the defender has seen it in their "you got raided" welcome-back report.
CREATE TABLE IF NOT EXISTS mkt_raid_defense (
    id           BIGSERIAL PRIMARY KEY,
    defender_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    attacker_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    gold         INT NOT NULL DEFAULT 0,
    gear_item_id TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seen_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_raid_defense_unseen ON mkt_raid_defense (defender_id) WHERE seen_at IS NULL;

-- Hard-to-earn defense badges (event badges granted at thresholds in doRaid — you must be RAIDED and win).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, sort_order) VALUES
    ('raid_defender', 'Ironclad Defender',  'Repelled 10 raids on your ship',  '🛡️', '#5b8dd6', FALSE, 148),
    ('raid_bastion',  'Unbreakable Bastion','Repelled 50 raids on your ship',  '🏰', '#c9a227', FALSE, 149)
ON CONFLICT (slug) DO NOTHING;
