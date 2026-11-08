-- ── THE KILL BAR: WHERE GROVE TOOLS COME FROM NOW ───────────────────────────────────────────────────────────
-- Luke, 2026-11-08, answering item R of docs/grove-feedback-backlog.md:
--
--   "You kill enemies in an area. A bar fills. It reaches full. You get a reward. The reward is a crafting
--    tool. The bar resets, you repeat. The reward is each crafting tool of that zone tier. Once you have all
--    tools. It becomes a low level chest, with a chance to roll higher. For zones 1 and 2 then high tier chest
--    would be iron. 3 and 4 gold, etc"
--
-- This replaces the workbench, which was deleted the same day along with monster parts. Tools were stranded
-- with no acquisition path at all; this is the path.
--
-- ── ONE ROW PER (MEMBER, MAP), AND THE MAP IS THE POINT ─────────────────────────────────────────────────────
-- A tool's TIER is its map — tier III is forged from map three's materials — so "each crafting tool of that
-- zone tier" means the twelve slots at the tier of the map you are standing in. The bar therefore belongs to
-- the map, not to the zone: walking through a gate between two zones of the same map must not reset your
-- progress, which would make moving feel like a punishment.
--
-- ⚠️ WHAT IS NOT STORED HERE, DELIBERATELY: which tools have been paid out. That is already answered by
-- mkt_grove_tool — a slot counts as satisfied for map N when its tier is >= N — and a second copy of it here
-- would be a second thing that can disagree about whether you own a pickaxe. The one question this table
-- answers that nothing else can is how far along the CURRENT fill you are.
CREATE TABLE IF NOT EXISTS mkt_grove_bar (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    map_n      INTEGER NOT NULL,
    -- Progress toward the next reward, 0..BAR_KILLS-1. The remainder carries: a settle of 300 kills on an
    -- empty bar pays once and leaves 50 on the clock, rather than throwing the surplus away.
    kills      INTEGER NOT NULL DEFAULT 0,
    -- ⚠️ A COUNTER, NOT A DERIVED NUMBER. Total times this bar has ever filled. Nothing gates on it; it is
    -- how the faucet gets measured later without reconstructing it from the chest grant log, which is the
    -- shape every economy question in this repo has needed and not had.
    fills      INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, map_n)
);
