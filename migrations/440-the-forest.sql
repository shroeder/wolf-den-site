-- ── THE FOREST ──────────────────────────────────────────────────────────────────────────────────────
-- A stand of trees you chop by tapping. See src/lib/marketplace/forest.js for the rules and why the
-- limiter is regrowth rather than a swing budget.
--
-- ONE ROW A MEMBER. The stand is a small fixed array of patches and it is rewritten on every fell, so it
-- is JSON rather than six more tables -- the same shape mkt_sailing uses for its dig board, and for the
-- same reason: nobody will ever query "all patches holding an oak".
CREATE TABLE IF NOT EXISTS mkt_forest (
    buyer_id    UUID PRIMARY KEY,
    wood        BIGINT NOT NULL DEFAULT 0,
    -- The axe. One column a track rather than JSON, because these ARE queried -- "what is the best axe in
    -- the Den" is a question somebody will ask, and a jsonb -> int cast in a leaderboard is a bad time.
    edge_level  INT NOT NULL DEFAULT 0,
    haft_level  INT NOT NULL DEFAULT 0,
    heft_level  INT NOT NULL DEFAULT 0,
    -- [{ tree, hp, felled, felledAt }] -- PATCHES long, rewritten whole.
    stand       JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Lifetime counters, for the badges and for anything that later wants to say "you have felled 400".
    felled      INT NOT NULL DEFAULT 0,
    swings      BIGINT NOT NULL DEFAULT 0,
    best_streak INT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
