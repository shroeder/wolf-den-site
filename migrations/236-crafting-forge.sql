-- The Forge (owner-gated blacksmith/crafting): salvage unequipped gear into tiered parts, combine parts up a
-- tier, and enhance equipped gear (a timing mini-game drives the stat roll). All owner-only in Phase 1.

-- Tiered salvage parts — one row per (member, tier 1..5).
CREATE TABLE IF NOT EXISTS mkt_salvage_part (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    tier     INT  NOT NULL,
    count    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, tier)
);

-- Per-item enhancement: the level + accumulated COMBAT stat bonus for a member's equipped item.
CREATE TABLE IF NOT EXISTS mkt_item_enhance (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id    TEXT NOT NULL,
    level      INT  NOT NULL DEFAULT 0,
    stat_bonus JSONB NOT NULL DEFAULT '{}'::jsonb, -- { might: 4, crit_power: 2, ... } added on top of the item's base stats
    best_grade TEXT,                               -- best mini-game grade ever landed on this item (flavor)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_item_enhance_buyer ON mkt_item_enhance(buyer_id);

-- Crafting telemetry — every salvage / combine / enhance, down to the item, tier, score, grade and timestamp.
CREATE TABLE IF NOT EXISTS mkt_craft_event (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    action     TEXT NOT NULL,   -- salvage | combine | enhance | open_forge
    item_id    TEXT,            -- item salvaged / enhanced (null for combine/open)
    tier       INT,             -- part tier involved
    score      INT,             -- mini-game score 0..1000 (enhance)
    grade      TEXT,            -- headline mini-game grade (enhance): good|great|perfect|pixel
    meta       JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_craft_event_buyer ON mkt_craft_event(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_craft_event_action ON mkt_craft_event(action, created_at DESC);
