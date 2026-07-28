-- Collective plaza upgrades: members pool gold toward shared decorations. Single-row running total.
CREATE TABLE IF NOT EXISTS mkt_town_upgrade (
    id         SMALLINT PRIMARY KEY DEFAULT 1,
    gold_total BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT town_upgrade_singleton CHECK (id = 1)
);
INSERT INTO mkt_town_upgrade (id, gold_total) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
