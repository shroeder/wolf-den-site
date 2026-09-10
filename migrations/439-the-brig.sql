-- ── THE BRIG ────────────────────────────────────────────────────────────────────────────────────────
-- Capturing a fleet captain instead of his cargo, interrogating him, and turning three confessions into
-- a chart. See src/lib/marketplace/captains.js for the rules and why they are shaped this way.
--
-- A TABLE AND NOT A JSON COLUMN ON mkt_sailing. Four berths is a small number, but a captive is a thing
-- with a lifecycle — taken, worked on, broken or ransomed — and every one of those is a row people will
-- want to count later. `dig_state` is already a JSON blob nobody can query; this does not add a second.

CREATE TABLE IF NOT EXISTS mkt_ship_captive (
    id           BIGSERIAL PRIMARY KEY,
    buyer_id     UUID NOT NULL,
    rank         INT  NOT NULL,              -- the rung he was commanding; stars derive from it
    stars        INT  NOT NULL,
    art          TEXT NOT NULL,              -- fleet art id, for his portrait
    name         TEXT NOT NULL,
    ship         TEXT NOT NULL,
    -- ⚠️ HIDDEN FROM THE CLIENT UNTIL HE BREAKS. The whole minigame is working out what this says, so it
    -- must never travel in a payload — see brigView in captains-store.js, which is the only reader.
    disposition  TEXT NOT NULL,
    tell         TEXT NOT NULL,
    will         INT  NOT NULL,
    nerve        INT  NOT NULL,
    tried        JSONB NOT NULL DEFAULT '[]'::jsonb,
    status       TEXT NOT NULL DEFAULT 'held',   -- held | broken | spent
    taken_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ
);

-- The brig query is always "this member's captives that are still aboard", so that is the index.
CREATE INDEX IF NOT EXISTS mkt_ship_captive_brig
    ON mkt_ship_captive (buyer_id) WHERE ended_at IS NULL;

-- ── THE CONFESSIONS, AND THE CHART THEY MAKE ────────────────────────────────────────────────────────
-- A broken captain leaves a confession behind. Three of them make a chart, and the chart's grade is the
-- three men's stars added up — so the confession has to remember whose it was after he has gone.
CREATE TABLE IF NOT EXISTS mkt_ship_confession (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL,
    stars       INT  NOT NULL,
    name        TEXT NOT NULL,
    ship        TEXT NOT NULL,
    art         TEXT NOT NULL,
    spent_on    BIGINT,                      -- the chart it went into, once it has been used
    made_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mkt_ship_confession_unspent
    ON mkt_ship_confession (buyer_id) WHERE spent_on IS NULL;

CREATE TABLE IF NOT EXISTS mkt_ship_chart (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL,
    grade       INT  NOT NULL,               -- 3..15, the three captains' stars
    band        TEXT NOT NULL,               -- sounding | bearing | reckoning | certainty
    made_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sailed_at   TIMESTAMPTZ                  -- NULL until it has been spent on a voyage
);
CREATE INDEX IF NOT EXISTS mkt_ship_chart_unsailed
    ON mkt_ship_chart (buyer_id) WHERE sailed_at IS NULL;

-- The voyage a chart was spent on, so the dig on the other end knows it is a charted island and which
-- one. NULL for every ordinary voyage, which is every voyage that exists today.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS chart_id BIGINT;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS chart_grade INT;
