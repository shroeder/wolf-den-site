-- ── THE CHART BECOMES A PLACE ────────────────────────────────────────────────────────────────────────────────
-- Luke: "I would like the chart you get to be something you open and solve, and it would only take 30 seconds
-- to get there, and have unique fights on the way. Along with the idea of our boat landing ashore and being
-- able to walk on unique islands."
--
-- Until now a chart unlocked a fourth button on the helm — a sixteen-hour voyage that landed on the same dig
-- board with a different backdrop. It is an EXPEDITION now: open the chart, plot the fix, push off, fight two
-- named things in thirty seconds of live sailing, beach the boat and walk the island.
--
-- Nothing here changes an ordinary voyage. mkt_sailing is untouched; the three durations keep working exactly
-- as they do, which is what Luke asked for ("leave them alone for now").

-- ── THE CHART'S OWN FACE ─────────────────────────────────────────────────────────────────────────────────────
-- A chart has to draw the same three rings every time it is opened — reload the page mid-plot and it must be
-- the same puzzle, not a new one. The seed is stamped at CAPTURE, so the place a captain named was already
-- decided the moment he named it, which is the only honest way round: a destination rolled at open time would
-- be a chart whose island depends on when you got round to looking at it.
ALTER TABLE mkt_ship_chart ADD COLUMN IF NOT EXISTS seed BIGINT;

-- Every chart already in somebody's hold gets one now, derived from its own id so it is stable and so two
-- charts never share a face. Charts minted from here on get theirs in captains-store.js.
UPDATE mkt_ship_chart SET seed = (id * 7919 + 104729) % 2147483647 WHERE seed IS NULL;

-- ── THE EXPEDITION ───────────────────────────────────────────────────────────────────────────────────────────
-- One open row per member at a time, enforced by the partial unique index below rather than by a check in the
-- code: two tabs that both push off would otherwise be two boats on one chart, and the fix for that belongs in
-- the database on a driver with no transactions (see [[postgres-landmines]]).
CREATE TABLE IF NOT EXISTS mkt_ship_expedition (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID   NOT NULL,
    chart_id    BIGINT,                        -- the chart it was opened from; NULL only if that chart is gone
    seed        BIGINT NOT NULL,               -- the chart's face AND the island's layout, one number
    grade       INT    NOT NULL,               -- his stars, 1..5 — picks the island's rung band
    island      TEXT   NOT NULL,               -- islands.js id, resolved once at open and never re-rolled

    -- plot | run | ashore | done. `run` is the thirty seconds; `ashore` is the walk.
    phase       TEXT   NOT NULL DEFAULT 'plot',

    -- Where the pin went, in chart-face units, and what it scored. Stored rather than recomputed so a finished
    -- expedition can still say how well it was read after the fact.
    plot_x      REAL,
    plot_y      REAL,
    accuracy    REAL,

    -- The landfall, all of it decided the instant the plot is committed. `tide` is the step budget and it is
    -- measured off the real walk, so it can never be too short to reach the mark — see chart-plot.js.
    span        INT,
    entry       INT,
    fix_index   INT,
    tide        INT,

    -- The walk. `spent` is steps used, `at_node` is where the member is standing, `taken` is every node index
    -- already collected — the anti-double-claim, checked server-side against a regenerated island.
    spent       INT    NOT NULL DEFAULT 0,
    at_node     INT,
    taken       JSONB  NOT NULL DEFAULT '[]'::jsonb,

    -- The two fights on the way in: [{at: 0.38, foe: "esc_growler", done: false}, ...]
    marks       JSONB  NOT NULL DEFAULT '[]'::jsonb,

    -- What it has paid so far, so the landfall card can total the run without walking the ledger.
    purse       INT    NOT NULL DEFAULT 0,

    opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ran_at      TIMESTAMPTZ,                   -- when the boat pushed off; the thirty seconds are measured off this
    ashore_at   TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ
);

-- ⚠️ ONE OPEN EXPEDITION PER MEMBER. A partial unique index, not a plain one: finished rows accumulate forever
-- and must not collide with each other. See [[postgres-landmines]] on ON CONFLICT against a partial index —
-- the code inserts and lets this raise rather than relying on an upsert it cannot express here.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_ship_expedition_open
    ON mkt_ship_expedition (buyer_id) WHERE ended_at IS NULL;

-- Reading a member's own history, newest first.
CREATE INDEX IF NOT EXISTS mkt_ship_expedition_by_buyer
    ON mkt_ship_expedition (buyer_id, opened_at DESC);
