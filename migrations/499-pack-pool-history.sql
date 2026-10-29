-- ── THE PATH alpha TOOK, NOT JUST WHERE IT ENDED UP ─────────────────────────────────────────────────────────
-- mkt_pack_pool_state is STATE: one row per pool, overwritten on every recompute. So the shelf could answer
-- "what are the odds today" and nothing else. Not "when did this pool get meaner", not "was that a card we
-- bought in or a card somebody pulled", and not "did the 15% margin actually hold last month".
--
-- ⚠️ AND IT COULD NEVER BE RECONSTRUCTED. alpha is solved against the exact shelf composition at that moment
-- (see solveAlpha), and the composition is not snapshotted either. A day that went unrecorded is gone. That is
-- the whole reason this is worth doing before anything else on the pack ladder: every other item on that list
-- can be built later with the same quality, and this one cannot.
--
-- Append-only, one row per pool per recompute. recomputePools runs nightly (vercel.json, "15 8 * * *"), so
-- this is about six rows a night — roughly 2,200 a year, which is nothing. No change-detection: a row that
-- says "identical to yesterday" is a real observation and makes a chart continuous. Flat stretches are
-- information too.
CREATE TABLE IF NOT EXISTS mkt_pack_pool_history (
    id                      BIGSERIAL PRIMARY KEY,
    pool                    TEXT NOT NULL,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- The curve.
    alpha                   NUMERIC(8, 4),
    first_open_alpha        NUMERIC(8, 4),
    first_open_floor_cents  INTEGER,

    -- The money. margin_bp is STORED rather than derived on read: it is the number this whole feature is
    -- tuned to, and TARGET_MARGIN_BP may be changed one day — at which point a margin recomputed from
    -- today's constant would silently rewrite history to agree with the new target.
    price_cents             INTEGER,
    ev_cents                INTEGER,
    uniform_ev_cents        INTEGER,
    margin_bp               INTEGER,

    -- The shelf that produced them. Without these a drop in alpha is unattributable: cards arriving and
    -- cards leaving move it in opposite directions and both look identical in the alpha column alone.
    units                   INTEGER,
    lines                   INTEGER,
    median_cents            INTEGER,
    band_lo_cents           INTEGER,
    band_hi_cents           INTEGER,

    open                    BOOLEAN,
    closed_reason           TEXT,
    -- What ran it: the nightly cron, or a hand recompute. A step that only appears on manual runs is a very
    -- different story from one that appeared overnight.
    source                  TEXT NOT NULL DEFAULT 'cron'
);

-- Every read of this table is "this pool, newest first" or "this pool, over a window".
CREATE INDEX IF NOT EXISTS idx_pack_pool_history_pool_at ON mkt_pack_pool_history(pool, computed_at DESC);
