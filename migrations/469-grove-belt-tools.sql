-- ── THE BELT AND THE TOOLS ───────────────────────────────────────────────────────────────────────────────
-- Luke: "We need a way to equip food or potions that auto heal you if you get below 60 percent hp."
-- and: "My idea was for you to craft different tiers of these utility items as you progress through maps."
--
-- `belt` is which food is equipped. The food ITSELF lives in mkt_grove_item like everything else — it takes a
-- bag slot, which is the point: slots are the scarcest thing a player has, so carrying healing costs you
-- carrying something else.
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS belt text;

-- ⚠️ TOOLS ARE TIERED AND THE TIER IS THE PROGRESSION. One row per slot per player, holding the best tier
-- made so far. The Grove yields tier 1; map two yields tier 2, and so on — which is why this stores a NUMBER
-- rather than an item id. A tool is not a thing you collect, it is a rung you reach.
CREATE TABLE IF NOT EXISTS mkt_grove_tool (
    buyer_id    uuid        NOT NULL,
    slot        text        NOT NULL,
    tier        int         NOT NULL DEFAULT 1,
    made_at     timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, slot)
);
