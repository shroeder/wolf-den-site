-- ── THE ROAD BECOMES A SEASON ────────────────────────────────────────────────────────────────────────────────
-- Luke: "make the road seasonal behind a gate so I can test it ... the season will have season exclusive
-- rewards for each 25 rungs, totalling 8. Last of which rung 200."
--
-- Three facts the Road did not previously have to keep, and one it did.
--
--   WHICH SEASON THE RUNGS BELONG TO. `mkt_arena.ladder_beaten` is a set of ints with no date on it, so the
--   first thing a season needs is to know whether the set in front of it is this season's or last one's.
--   `road_season` is that stamp, and 0 means "written before seasons existed" — which is every row today.
--
--   WHAT THE CLIMB WAS WORTH AFTERWARDS. A season resets the rungs. That is the point of it, and it is also
--   the one thing that could read as progress being taken away, so nothing is thrown out: `road_best_rung` is
--   the highest rung this member has EVER put down and it only goes up, and mkt_arena_road_season keeps the
--   per-season record so the trophy room can say "Season 1: rung 63" for as long as the Den exists.
--
--   WHAT HAS ALREADY BEEN PAID. mkt_arena_road_prize is the ledger for the eight. It is keyed on
--   (buyer, season, rung) rather than on the prize's id, because the id is the thing a future season might
--   reuse and the RUNG is what was actually earned. A prize granted twice is the failure this table exists to
--   make impossible — two taps that both resolve a winning bout must not both hand over a pet.
--
-- ⚠️ NOTHING IS RESET HERE. The rollover is lazy and happens in code the first time a member's Road is read
-- (see roadSeason in arena.js): a bulk UPDATE would wipe the sets of ninety members in one statement, before
-- the season is even open, and neon() has no transactions to take it back with. Rows roll over one at a time,
-- when their owner turns up, archiving as they go.

-- Which season the rungs currently in ladder_beaten were won in. 0 = before seasons; those roll into the
-- archive as "season 0" the first time their owner opens the Road.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS road_season int NOT NULL DEFAULT 0;

-- The highest rung ever taken, across every season. Monotonic — the reset never touches it.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS road_best_rung int NOT NULL DEFAULT 0;

-- Seed it from what is already there, so nobody's existing climb reads as zero the moment seasons land. The
-- ninety-odd members walking the Road today are at rungs up to 99 and this is the only record of that after
-- the first rollover.
UPDATE mkt_arena
   SET road_best_rung = GREATEST(
           road_best_rung,
           COALESCE((SELECT MAX(r) FROM unnest(ladder_beaten) AS r), 0)
       )
 WHERE ladder_beaten IS NOT NULL AND array_length(ladder_beaten, 1) > 0;

-- ── THE ARCHIVE ──────────────────────────────────────────────────────────────────────────────────────────────
-- One row per member per season, written at the moment their rungs are cleared for a new one. `beaten` is the
-- COUNT rather than the set: the set is what the reset is throwing away, and keeping a copy of it would mean
-- the "you may fight this rung" rule has two places to read from, which is the bug that made ladder_beaten
-- authoritative in the first place (see the note on nextRung — derived, never stored).
CREATE TABLE IF NOT EXISTS mkt_arena_road_season (
    buyer_id   uuid        NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    season     int         NOT NULL,
    best_rung  int         NOT NULL DEFAULT 0,
    beaten     int         NOT NULL DEFAULT 0,
    closed_at  timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, season)
);

-- ── THE PRIZE LEDGER ─────────────────────────────────────────────────────────────────────────────────────────
-- `kind` and `ref` are recorded alongside the rung even though the season table in code could re-derive them,
-- because a season's prize list is EDITABLE and this is a receipt. If season 1's rung-100 pet is ever changed,
-- this row still says which pet was actually handed to this member, and the pets table will agree with it.
CREATE TABLE IF NOT EXISTS mkt_arena_road_prize (
    buyer_id   uuid        NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    season     int         NOT NULL,
    rung       int         NOT NULL,
    kind       text        NOT NULL,
    ref        text        NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, season, rung)
);

-- The Road screen asks "which of the eight have I got" on every render, keyed by member and season.
CREATE INDEX IF NOT EXISTS mkt_arena_road_prize_who ON mkt_arena_road_prize (buyer_id, season);
