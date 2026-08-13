import "server-only";

import { db } from "@/lib/db";

// ── DID THE CRON RUN? ────────────────────────────────────────────────────────────────────────────────────────
// A scheduled job that leaves no trace can only be audited by forensics. The TCG catalog sync is the example
// that prompted this: it upserts the whole catalog and stamps every row it touches, so each run erases the
// evidence of the last one, and the only history is the handful of products that were delisted and therefore
// stopped being written. That proved the job fires on schedule WHEN it fires and nothing about whether it
// fired yesterday.
//
// One row per run, opened before the work and closed after. Deliberately best-effort on both ends: a logging
// failure must never be the reason a nightly sync fails.
//
// The row is opened with ok = NULL and only set once the job lands, so a job that started and never returned
// stays visibly unfinished — which is the failure a success-only log cannot show you.

/** Open a run. Returns an id to pass to finishJobRun, or null if logging itself failed. */
export async function startJobRun(job, detail = null) {
    const row = await db.queryOne(
        `INSERT INTO job_run (job, detail) VALUES ($1, $2::jsonb) RETURNING id`,
        [String(job), detail ? JSON.stringify(detail) : null]
    ).catch(() => null);
    return row?.id ?? null;
}

/** Close a run. `detail` is merged over whatever was recorded at the start. */
export async function finishJobRun(id, { ok = true, detail = null, error = null } = {}) {
    if (!id) return;
    await db.query(
        `UPDATE job_run
            SET finished_at = NOW(), ok = $2,
                detail = COALESCE(detail, '{}'::jsonb) || COALESCE($3::jsonb, '{}'::jsonb),
                error = $4
          WHERE id = $1`,
        [id, Boolean(ok), detail ? JSON.stringify(detail) : null, error ? String(error).slice(0, 2000) : null]
    ).catch(() => {});
}

/**
 * The last N runs of a job, newest first — what an admin screen or a one-off check reads.
 *
 * `gapHours` is the useful part: the time since the previous run. A daily job showing 24, 24, 24, 71 is a job
 * that missed a day, and that is the shape you are looking for when you ask whether the cron is working.
 */
export async function recentJobRuns(job, limit = 14) {
    return db.query(
        `SELECT id, started_at, finished_at, ok, detail, error,
                ROUND(EXTRACT(EPOCH FROM (started_at - LAG(started_at) OVER (ORDER BY started_at))) / 3600.0, 1) AS gap_hours,
                ROUND(EXTRACT(EPOCH FROM (finished_at - started_at))) AS seconds
           FROM job_run WHERE job = $1 ORDER BY started_at DESC LIMIT $2`,
        [String(job), Math.max(1, Math.min(200, limit))]
    ).catch(() => []);
}
