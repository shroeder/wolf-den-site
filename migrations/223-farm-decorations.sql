-- Farm DECORATIONS (mig223). The 100-item catalog lives in code (decorations.js); these tables track what each
-- member OWNS, where they've PLACED it in their pasture, and the generated die-cut sprite art per decoration.
-- Decorations are NEVER tradeable (there is no decoration trade path, like consumables).
CREATE TABLE IF NOT EXISTS mkt_deco_owned (
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    deco_id     TEXT NOT NULL,
    qty         INT NOT NULL DEFAULT 1,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, deco_id)
);

-- Each PLACED instance carries a position (x/y as % of the field) + draw order. Placing is the "equip" that
-- turns on a decoration's passive buff. You can place up to as many copies as you own.
CREATE TABLE IF NOT EXISTS mkt_deco_placement (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    deco_id    TEXT NOT NULL,
    x          REAL NOT NULL DEFAULT 50,
    y          REAL NOT NULL DEFAULT 60,
    z          INT  NOT NULL DEFAULT 0,
    flip       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deco_placement_buyer ON mkt_deco_placement (buyer_id);

-- Generated die-cut sprite per decoration (regenerated via the admin endpoint). deco_id 'custom:<uuid>' rows
-- back player-made decorations (Phase 2).
CREATE TABLE IF NOT EXISTS mkt_deco_sprite (
    deco_id    TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
