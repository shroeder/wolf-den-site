-- ── QUEST CHAINS AND THE COLISEUM ───────────────────────────────────────────────────────────────────────────
-- Two systems Luke specified on 2026-10-29. Content lives in grove-npcs.js; this is only what a PLAYER has
-- done about it, which is the part that cannot be regenerated.

-- One row per member per step they have started. Rows are created lazily — a chain with no row anywhere is
-- simply a chain nobody has begun, which keeps 192 members x 71 steps from existing as empty rows.
--
-- ⚠️ `step_id` IS CONTENT, NOT A FOREIGN KEY. It is "alder_2", built from the NPC id and the index, and it
-- stays stable as long as a chain's SHAPE does. Re-ordering an existing chain in grove-npcs.js would silently
-- re-point progress at a different ask — so steps get appended, never inserted in the middle.
CREATE TABLE IF NOT EXISTS mkt_grove_quest (
    buyer_id     UUID NOT NULL,
    step_id      TEXT NOT NULL,
    npc_id       TEXT NOT NULL,
    map_n        INTEGER NOT NULL,
    progress     INTEGER NOT NULL DEFAULT 0,
    claimed_at   TIMESTAMPTZ,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, step_id)
);

-- The tracker reads "everything I have on the go", which is this index exactly.
CREATE INDEX IF NOT EXISTS idx_grove_quest_open
    ON mkt_grove_quest (buyer_id, map_n) WHERE claimed_at IS NULL;

-- ── THE COLISEUM ────────────────────────────────────────────────────────────────────────────────────────────
-- One row per member per map. Keys are held PER MAP on purpose: a key earned outside the Ashen Reach's
-- Coliseum should not open the Grove's, or the daily from an easy map becomes a free run at a hard one.
--
-- ⚠️ `daily_on` IS A CENTRAL DATE, NOT A TIMESTAMP. The shop's day is America/Chicago and a UTC date rolls
-- over in the middle of a Central evening — the same trap the pull-queue reminder is written around. Storing
-- the date the daily was taken, as text, makes "have I claimed today" a string compare against the shop's own
-- clock rather than an arithmetic question about timezones.
CREATE TABLE IF NOT EXISTS mkt_grove_coliseum (
    buyer_id    UUID NOT NULL,
    map_n       INTEGER NOT NULL,
    keys        INTEGER NOT NULL DEFAULT 0,
    daily_on    TEXT,
    best_wave   INTEGER NOT NULL DEFAULT 0,
    runs        INTEGER NOT NULL DEFAULT 0,
    clears      INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, map_n)
);

-- ── CHESTS WAITING ON THE GROUND ────────────────────────────────────────────────────────────────────────────
-- A finished run spawns chests the player walks over and taps. They are rows rather than scene state because
-- the run ENDS and the tapping does not have to happen in the same breath — closing the tab mid-collection
-- must not be how you lose the thing you just earned.
--
-- ⚠️ THESE DO NOT PAY THE NORMAL CHEST TABLE. Luke: "the actual loot that pops out of these chests is
-- different." Same sprites, same rarity names, different contents — so the tier here is a LOOK and a weight,
-- and the roll that reads it lives in the Coliseum's own payout, not in the forge's.
CREATE TABLE IF NOT EXISTS mkt_grove_coliseum_chest (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL,
    map_n       INTEGER NOT NULL,
    tier        TEXT NOT NULL,
    opened_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grove_col_chest_open
    ON mkt_grove_coliseum_chest (buyer_id) WHERE opened_at IS NULL;
