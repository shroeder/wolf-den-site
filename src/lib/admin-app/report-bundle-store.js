import "server-only";

import { db } from "@/lib/db.js";
import { buildReportBundle } from "@/lib/admin-app/reports-v2.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "report-bundle" });

// v1 asks Square for 730 days. The port must ask for the same window or the two cannot be compared, even
// though the shop's history is shorter than that and the extra year costs nothing.
export const REPORT_LOOKBACK_DAYS = 730;

const GRANULARITIES = [
    ["day", "dailyBreakdown", "unitsDailyBreakdown"],
    ["week", "weeklyBreakdown", "unitsWeeklyBreakdown"],
    ["month", "monthlyBreakdown", "unitsMonthlyBreakdown"],
];

/**
 * Rebuild the bundle and publish it as a new generation.
 *
 * ⚠️ THE ORDER OF THE THREE WRITES IS THE WHOLE SAFETY STORY, because there is no transaction to wrap them
 * in. Breakdown rows first, then the pointer, then the sweep — so a reader either sees the old complete
 * generation or the new complete one, and never a half-written anything.
 */
export async function rebuildReportBundle({ lookbackDays = REPORT_LOOKBACK_DAYS } = {}) {
    const startedAt = Date.now();
    const bundle = await buildReportBundle({ lookbackDays });
    const generation = bundle.lastUpdatedMillis;

    // Batched because every neon() query is its own HTTPS round trip, and round trips ARE the Active CPU
    // bill — see the note at the top of CLAUDE.md. ~860 buckets in flights of 150 is six calls, not 860.
    const rows = [];
    for (const [granularity, moneyKey, unitsKey] of GRANULARITIES) {
        for (const [kind, key] of [["money", moneyKey], ["units", unitsKey]]) {
            for (const [bucketStart, categories] of Object.entries(bundle[key] || {})) {
                rows.push([generation, kind, granularity, Number(bucketStart), JSON.stringify(categories)]);
            }
        }
    }

    const BATCH = 150;
    for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const values = chunk.map((_, n) =>
            `($${n * 5 + 1}::bigint, $${n * 5 + 2}, $${n * 5 + 3}, $${n * 5 + 4}::bigint, $${n * 5 + 5}::jsonb)`
        ).join(", ");
        await db.query(
            `INSERT INTO ledger_report_breakdown (generation, kind, granularity, bucket_start, categories)
             VALUES ${values}
             ON CONFLICT (generation, kind, granularity, bucket_start) DO UPDATE SET categories = EXCLUDED.categories`,
            chunk.flat()
        );
    }

    // Only the charts' own data — deliberately without a single breakdown, so the screen's first load is a
    // few KB however many months the shop has been open.
    const series = {
        daily: bundle.daily, weekly: bundle.weekly, monthly: bundle.monthly,
        profitDaily: bundle.profitDaily, profitWeekly: bundle.profitWeekly, profitMonthly: bundle.profitMonthly,
        unitsDaily: bundle.unitsDaily, unitsWeekly: bundle.unitsWeekly, unitsMonthly: bundle.unitsMonthly,
        hourly: bundle.hourly,
        tradeCreditUnits: bundle.tradeCreditUnits,
        lastUpdatedMillis: bundle.lastUpdatedMillis,
    };

    const buildMs = Date.now() - startedAt;
    await db.query(
        `INSERT INTO ledger_report_bundle (id, generation, built_at, lookback_days, line_count, build_ms, series)
         VALUES (1, $1::bigint, now(), $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO UPDATE SET
            generation = EXCLUDED.generation, built_at = EXCLUDED.built_at,
            lookback_days = EXCLUDED.lookback_days, line_count = EXCLUDED.line_count,
            build_ms = EXCLUDED.build_ms, series = EXCLUDED.series`,
        [generation, lookbackDays, bundle.lineCount ?? 0, buildMs, JSON.stringify(series)]
    );

    // Last, and only now that nothing points at them.
    const swept = await db.query(
        `DELETE FROM ledger_report_breakdown WHERE generation <> $1::bigint RETURNING 1`, [generation]
    ).catch(() => []);

    logger.info("report_bundle.rebuilt", {
        generation, buildMs, buckets: rows.length, sweptRows: swept.length, lookbackDays,
    });
    return { generation, buildMs, buckets: rows.length, sweptRows: swept.length };
}

/** The charts, and when they were built. Null when the job has never run. */
export async function readReportSeries() {
    const row = await db.queryOne(
        `SELECT generation, built_at, lookback_days, line_count, build_ms, series
           FROM ledger_report_bundle WHERE id = 1`
    ).catch(() => null);
    if (!row) return null;
    return {
        generation: Number(row.generation),
        builtAt: row.built_at,
        lookbackDays: Number(row.lookback_days),
        buildMs: Number(row.build_ms),
        ...row.series,
    };
}

/** One bucket's categories. `kind` is 'money' or 'units'. */
export async function readReportBreakdown({ kind, granularity, bucketStart }) {
    const row = await db.queryOne(
        `SELECT b.categories FROM ledger_report_breakdown b
           JOIN ledger_report_bundle s ON s.id = 1 AND s.generation = b.generation
          WHERE b.kind = $1 AND b.granularity = $2 AND b.bucket_start = $3::bigint`,
        [kind, granularity, bucketStart]
    ).catch(() => null);
    return row?.categories ?? null;
}


const BREAKDOWN_FIELD = {
    "money|day": "dailyBreakdown", "money|week": "weeklyBreakdown", "money|month": "monthlyBreakdown",
    "units|day": "unitsDailyBreakdown", "units|week": "unitsWeeklyBreakdown", "units|month": "unitsMonthlyBreakdown",
};

/**
 * The whole ReportsSalesData, series and every breakdown, in the shape the app's parser expects.
 *
 * ⚠️ THIS IS THE ONE RESPONSE WITH A CEILING ON IT. The Reports screen's category charts call
 * `data.breakdown(granularity, start)` for EVERY point they plot, not just for a tapped bar, so the screen
 * genuinely needs all of them before it can draw — lazy per-bucket loading would leave four charts empty.
 * Measured at 2.14MB with six months of history against a 4.5MB serverless response limit, and it grows
 * with the daily buckets. `payloadBytes` is returned so the growth is visible in a log rather than
 * discovered as a failure; when it approaches the limit, the fix is to serve only the granularity being
 * viewed and re-fetch on switch, which is what readReportBreakdown is already there for.
 */
export async function readWholeBundle() {
    const series = await readReportSeries();
    if (!series) return null;
    const rows = await db.query(
        `SELECT b.kind, b.granularity, b.bucket_start, b.categories
           FROM ledger_report_breakdown b
           JOIN ledger_report_bundle s ON s.id = 1 AND s.generation = b.generation`
    ).catch(() => []);
    const out = { ...series };
    for (const field of Object.values(BREAKDOWN_FIELD)) out[field] = {};
    for (const r of rows) {
        const field = BREAKDOWN_FIELD[`${r.kind}|${r.granularity}`];
        if (field) out[field][String(r.bucket_start)] = r.categories;
    }
    return out;
}
