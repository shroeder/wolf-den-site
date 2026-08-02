-- MINING (owner-gated, phase 1). A cave you walk your hero around, with ore nodes that spawn through the day
-- and are mined with the same timing swing as the Forge anvil and the Treasure Golem.
--
-- Ore nodes are SERVER rows, not client rolls — the same call the swarm raids make. It's the only way a rich
-- tier can be genuinely rare, the only way two miners can share a cave later, and the only way the spawn
-- schedule can be reasoned about at all.

-- Per-member mining state: position in the cave, upgrade tracks, the daily swing allowance, lifetime tallies.
CREATE TABLE IF NOT EXISTS mkt_mining (
    buyer_id      UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    -- Cave position, same units as the town (percent of the scene) so the movement code carries straight over.
    x             REAL NOT NULL DEFAULT 50,
    y             REAL NOT NULL DEFAULT 78,
    facing        SMALLINT NOT NULL DEFAULT 1,
    -- Upgrade tracks (gold-bought, capped) — see MINE_TRACKS in mining.js.
    pick_level    INT NOT NULL DEFAULT 0,   -- swing damage: fewer swings per node
    lantern_level INT NOT NULL DEFAULT 0,   -- see richer nodes / better tier odds
    haul_level    INT NOT NULL DEFAULT 0,   -- more ore per node
    vigor_level   INT NOT NULL DEFAULT 0,   -- more swings per day
    -- Daily swing allowance, lazily day-reset store-local (America/Chicago), same pattern as casts + pettings.
    swing_day     DATE,
    swing_used    INT NOT NULL DEFAULT 0,
    swing_bonus   INT NOT NULL DEFAULT 0,   -- consumable-granted extra swings today
    -- Lifetime, for badges and the stat strip.
    nodes_mined   INT NOT NULL DEFAULT 0,
    ore_total     INT NOT NULL DEFAULT 0,
    best_combo    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The ore a member is holding, by tier (1..5). Kept as its own table rather than a JSONB blob because
-- smelting will need to spend an exact amount of one tier atomically.
CREATE TABLE IF NOT EXISTS mkt_ore (
    buyer_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    tier      SMALLINT NOT NULL,
    qty       INT NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, tier)
);

-- Ore nodes in the cave. Spawned server-side on a schedule; `hp` is chipped down by swings and the node is
-- claimed by whoever lands the blow that empties it.
CREATE TABLE IF NOT EXISTS mkt_ore_node (
    id          BIGSERIAL PRIMARY KEY,
    tier        SMALLINT NOT NULL,
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    hp          INT NOT NULL,
    hp_max      INT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',   -- active | mined | expired
    spawned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    mined_by    UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    mined_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ore_node_active ON mkt_ore_node (status, expires_at) WHERE status = 'active';

-- Per-member, per-node progress. A node is shared scenery; the ore goes to whoever actually swings at it, and
-- this is what stops one member's swings paying out to another.
CREATE TABLE IF NOT EXISTS mkt_ore_node_hit (
    node_id      BIGINT NOT NULL REFERENCES mkt_ore_node(id) ON DELETE CASCADE,
    buyer_id     UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    damage       INT NOT NULL DEFAULT 0,
    swings       INT NOT NULL DEFAULT 0,
    combo        INT NOT NULL DEFAULT 0,
    last_swing_at TIMESTAMPTZ,
    PRIMARY KEY (node_id, buyer_id)
);
