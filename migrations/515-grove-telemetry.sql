-- ── WHAT THE GROVE IS ACTUALLY DOING, ON REAL DEVICES ───────────────────────────────────────────────────────
-- Luke, 2026-11-15, after a day of chasing a freeze with no evidence: "we need telemetry and insight in the
-- admin app for the grove feature".
--
-- ⚠️ IT EXISTS BECAUSE mkt_client_error COULD NOT ANSWER THE QUESTION. That table records a CRASH — a thing
-- that already went wrong, one row per incident, with no idea what normal looks like. The Coliseum freeze
-- took a day to find because there was no "normal" to compare against: no record of how many runs start, how
-- far they get, how fast a frame is on a real phone, or whether a scene has ever thrown.
--
-- One narrow table, append-only, written by the client at moments that matter rather than on a timer. A row
-- per dive, per run, per throw — not a row per frame.
CREATE TABLE IF NOT EXISTS mkt_grove_telemetry (
    id          bigserial PRIMARY KEY,
    buyer_id    uuid,
    kind        text        NOT NULL,     -- scene_throw | run_end | dive_end | stall
    created_at  timestamptz NOT NULL DEFAULT NOW(),
    zone        int,
    arena       boolean     NOT NULL DEFAULT FALSE,
    wave        int,
    foes        int,
    -- ⚠️ THE FRAME NUMBERS ARE THE POINT. A freeze is the END of something; these are the something.
    -- worst_frame_ms on a healthy run told us in one row that the Coliseum freeze was NOT a slow frame
    -- (42ms, then silence) and killed a whole day's wrong theory.
    worst_frame_ms int,
    slow_frames    int,
    message     text,                     -- a throw's message, truncated
    stack       text,
    device      text,                     -- cores/memory/dpr, so "it is fine on my machine" is checkable
    meta        jsonb
);

-- Reads are always "recent, by kind" or "recent, by member".
CREATE INDEX IF NOT EXISTS mkt_grove_telemetry_at    ON mkt_grove_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_grove_telemetry_kind  ON mkt_grove_telemetry (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_grove_telemetry_buyer ON mkt_grove_telemetry (buyer_id, created_at DESC);
