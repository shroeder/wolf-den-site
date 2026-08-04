-- ── THE ARENA ────────────────────────────────────────────────────────────────────────────────────────────────
-- Player-versus-player, fought as a LADDER: the pack sorted weakest to strongest, and you start at the bottom.
-- Each win moves you up one rung and the next opponent is a real member with their real level, real gear and
-- real hero. Nobody has to be online — you fight their loadout, not their attention.
--
-- One row per member. `rung` is how far up they have climbed; the ladder itself is computed live from everyone's
-- power, so it re-sorts as the pack gears up rather than freezing on the day it was built.
--
-- buyer_id is UUID. mkt_buyer.id is a UUID and declaring this BIGINT is exactly how migration 327 failed the
-- Vercel build — local builds never run migrations, so the first place it shows up is production.
CREATE TABLE IF NOT EXISTS mkt_arena (
    buyer_id     UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    rung         INT NOT NULL DEFAULT 0,   -- opponents beaten; also the index of the next one
    best_rung    INT NOT NULL DEFAULT 0,
    wins         INT NOT NULL DEFAULT 0,
    losses       INT NOT NULL DEFAULT 0,
    streak       INT NOT NULL DEFAULT 0,
    best_streak  INT NOT NULL DEFAULT 0,
    fights_day   DATE,                     -- store-local day the counter below belongs to
    fights_today INT NOT NULL DEFAULT 0,
    bout_json    JSONB,                    -- the bout in progress, if any
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The standings board reads best_rung then best_streak.
CREATE INDEX IF NOT EXISTS idx_arena_standing ON mkt_arena (best_rung DESC, best_streak DESC);
