-- ── REPORTS V2: SOMEWHERE TO KEEP THE NIGHTLY BUNDLE ──────────────────────────────────────────────────
-- Luke: "Can we make a reports v2 on the admin and employee app, and its all server side, once a night.
-- That way we can serve a cached report bundle to the app so it loads faster."
--
-- v1 rebuilds the whole report on the handset every time the screen is opened: a 730-day Square order
-- search, a catalog batch-retrieve per 100 variations, and ONE PAYMENT FETCH PER PAYMENT for the card fees.
-- Measured from the server that is 43s for 120 days. The work does not change between two people opening
-- the screen a minute apart, so it is done once a night and read from here.
--
-- ── WHY TWO TABLES AND NOT ONE JSONB ──────────────────────────────────────────────────────────────────
-- The series (what the charts plot) is a few KB and is needed on every open. The breakdowns (every category
-- and every item inside every bucket) are megabytes and are needed one bucket at a time, when a bar is
-- tapped. In one column, a drill-down would read the whole TOASTed value to return 20KB of it, and the
-- initial load would have to ship all of it to stay under the admin-app proxy's ~4.5MB body cap.
-- See [[admin-app-proxy-body-limit]].
--
-- ── WHY A GENERATION COLUMN ───────────────────────────────────────────────────────────────────────────
-- ⚠️ THERE ARE NO TRANSACTIONS ON THE neon() HTTP DRIVER, so a rebuild cannot DELETE-then-INSERT without a
-- window in which a drill-down finds nothing and the screen reads as broken. See [[postgres-landmines]].
-- Instead each build writes a new generation, THEN points the singleton at it, then deletes the old ones.
-- A reader always resolves a complete generation, and the worst a crash mid-build can leave behind is
-- orphan rows nobody is pointed at, which the next run clears.
CREATE TABLE IF NOT EXISTS ledger_report_bundle (
    id            smallint PRIMARY KEY,
    generation    bigint      NOT NULL,
    built_at      timestamptz NOT NULL DEFAULT now(),
    lookback_days integer     NOT NULL,
    line_count    integer     NOT NULL,
    build_ms      integer     NOT NULL,
    -- daily/weekly/monthly sales, profit and units, plus hourly and the trade-credit footnote.
    series        jsonb       NOT NULL,
    CONSTRAINT ledger_report_bundle_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS ledger_report_breakdown (
    generation   bigint NOT NULL,
    -- 'money' sorts its categories and items by revenue; 'units' sorts the same bucket by quantity. They
    -- are stored apart because they are genuinely different orderings of the same lines, and the whole
    -- point of the Items Sold view is that a cheap single never appears near the top of a revenue sort.
    kind         text   NOT NULL,
    granularity  text   NOT NULL,
    -- Midnight America/Chicago for the bucket, in epoch millis — the same `startMillis` the app keys on.
    bucket_start bigint NOT NULL,
    categories   jsonb  NOT NULL,
    PRIMARY KEY (generation, kind, granularity, bucket_start)
);

-- The only sweep the rebuild performs: everything that is not the live generation.
CREATE INDEX IF NOT EXISTS idx_ledger_report_breakdown_generation
    ON ledger_report_breakdown (generation);
