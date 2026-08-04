-- ── THE ARENA BECOMES A REAL LADDER ──────────────────────────────────────────────────────────────────────────
-- The first cut walked you up the pack from the bottom: rung 0 was the weakest member alive and you had to beat
-- every one of them in order. For anyone already geared that is eighty fights they cannot lose, three a day —
-- a month of chores before the first interesting opponent. "I wasted all three on weak opponents."
--
-- So: an explicit POSITION (1 = top of the Den). You join where your power says you belong rather than at the
-- bottom, you CHALLENGE somebody above you, and beating them takes their spot.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS position INT;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS best_position INT;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS prize_day DATE;   -- last day this member was paid a podium chest

CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_position ON mkt_arena (position) WHERE position IS NOT NULL;

-- ── WHAT HAPPENED WHILE YOU WERE AWAY ────────────────────────────────────────────────────────────────────────
-- Every bout, from BOTH sides. The arena is asynchronous — you are fought while you are asleep — so a member
-- opening it needs to be told who came for them, who got through, and where that leaves them. Without this the
-- defender simply finds their position changed and no explanation anywhere.
CREATE TABLE IF NOT EXISTS mkt_arena_bout (
    id             BIGSERIAL PRIMARY KEY,
    challenger_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    defender_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    challenger_won BOOLEAN NOT NULL,
    -- Positions AFTER the bout, so a recap can say "you dropped from 4th to 5th" without recomputing history.
    challenger_pos INT,
    defender_pos   INT,
    rounds         INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arena_bout_defender ON mkt_arena_bout (defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_bout_challenger ON mkt_arena_bout (challenger_id, created_at DESC);
