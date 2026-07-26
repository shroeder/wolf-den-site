-- Forge upgrades: owner-buyable perks that aid salvaging output + ease the enhance mini-game. One row per
-- (member, upgrade key).
CREATE TABLE IF NOT EXISTS mkt_forge_upgrade (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    key      TEXT NOT NULL,
    level    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, key)
);
