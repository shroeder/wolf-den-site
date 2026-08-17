-- ── EVERY ARENA FIGHT GETS RECORDED, AND SAYS WHICH KIND IT WAS ──────────────────────────────────────────────
-- mkt_arena_bout has 1,216 rows and every single one with telemetry says kind "member". Not because the other
-- kinds are rare — six members cleared 22 to 30 rungs of the Long Road — but because they could never be
-- written at all:
--
--   defender_id is uuid REFERENCES mkt_buyer(id). A Long Road foe's id is `ladder:12`; a town skirmish foe's
--   is `town:<enemy>`. finishBout passed that straight into the uuid column for anything that was not a
--   Gauntlet tier, Postgres raised 22P02, and the INSERT's `.catch(() => {})` threw the error on the floor.
--   No row, no error, no sign. The Road and the plaza have been invisible since the day they shipped.
--
-- So the tuning pass that took the Road offline had nothing to tune against, and the only fights anyone could
-- measure were the member duels that happened to work.
--
-- The write path is fixed in arena.js (defender_id is now NULL unless the foe is a real member, and the insert
-- logs instead of swallowing). This adds the two columns that make a fight's kind a QUERYABLE fact rather than
-- something to be dug out of a JSON blob, because "how is the Road going" should be one index scan.
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS rung SMALLINT;

-- Backfill from the telemetry that IS there. The 525 pre-telemetry rows (4-12 Aug) get their kind from the
-- shape of the row instead: an npc_tier means a Gauntlet bout, a defender means a member duel. Anything left
-- is genuinely unknown and stays NULL rather than being guessed into a bucket it would then pollute.
UPDATE mkt_arena_bout
   SET kind = COALESCE(telemetry->>'kind',
                       CASE WHEN npc_tier IS NOT NULL THEN 'gauntlet'
                            WHEN defender_id IS NOT NULL THEN 'member' END),
       rung = NULLIF(telemetry->>'rung', '')::smallint
 WHERE kind IS NULL;

-- The three questions this table gets asked are "what happened lately", "how is kind X doing" and "how far up
-- the Road are people getting", so index the first two together and the rung on its own.
CREATE INDEX IF NOT EXISTS mkt_arena_bout_kind_created_idx ON mkt_arena_bout (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_arena_bout_rung_idx ON mkt_arena_bout (rung) WHERE rung IS NOT NULL;
