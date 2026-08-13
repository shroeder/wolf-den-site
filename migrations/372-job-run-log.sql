-- ── A CRON THAT CANNOT BE ASKED WHETHER IT RAN ───────────────────────────────────────────────────────────────
-- "I wonder if the api's cron is actually working" is a fair question and the codebase had no way to answer it.
-- The TCG catalog sync upserts the whole catalog and stamps price_updated_at = NOW() on every row it touches,
-- so each run ERASES the evidence of the one before: the only history left is the handful of products that
-- were delisted and therefore stopped being written. Thirty-six fossils across two months — enough to prove
-- the job fires on schedule when it fires, and nothing at all about whether it fired yesterday.
--
-- One row per run. Cheap, permanent, and it turns a forensic dig into a SELECT.
CREATE TABLE IF NOT EXISTS job_run (
    id          BIGSERIAL PRIMARY KEY,
    job         TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    -- NULL while running, true/false once it has landed. A row that stays NULL for hours is itself the signal:
    -- the job started and never came back, which is invisible in a log that only records successes.
    ok          BOOLEAN,
    detail      JSONB,
    error       TEXT
);
CREATE INDEX IF NOT EXISTS job_run_job_idx ON job_run (job, started_at DESC);
