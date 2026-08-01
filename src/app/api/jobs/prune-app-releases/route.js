import { NextResponse } from "next/server";

import { del } from "@vercel/blob";

import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── PRUNE SUPERSEDED APK BUILDS ──────────────────────────────────────────────────────────────────────────────
//
// The self-updater only ever serves the newest build of a channel — both readers order by version_code DESC and
// take one row. Every build below the top of its channel is unreachable bytes, and each one is ~108 MB. A busy
// day can publish a dozen; they had previously grown to ~40 GB, about 95% of the entire blob store.
//
// This existed only as a script somebody had to remember to run, which is the same as not existing. Nightly now.
//
// KEEP is 3, not 1, deliberately: the lookup takes the highest version_code, so deleting the newest row promotes
// the previous one back to current. That's a working rollback for a bad build, and two spare builds per channel
// cost ~0.6 GB against the tens of GB this reclaims.
const KEEP = 3;

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/prune-app-releases", async ({ logger, internalError }) => {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) return NextResponse.json({ ok: false, error: "no_blob_token" }, { status: 500 });
        try {
            const doomed = await db.query(
                `WITH ranked AS (
                     SELECT id, channel, version_code, apk_url, size_bytes,
                            row_number() OVER (PARTITION BY channel ORDER BY version_code DESC) AS rn
                       FROM app_release
                 )
                 SELECT id, channel, version_code, apk_url, size_bytes
                   FROM ranked WHERE rn > $1 ORDER BY channel, version_code DESC`,
                [KEEP]
            ).catch(() => []);

            let blobsGone = 0;
            let rowsGone = 0;
            let freed = 0;
            const failures = [];
            for (const r of doomed) {
                try {
                    if (r.apk_url) await del(r.apk_url, { token });
                    blobsGone += 1;
                    freed += Number(r.size_bytes || 0);
                } catch (e) {
                    // A 404 means the blob is already gone, so the row is still safe to drop. Anything else is
                    // left alone: a row pointing at a live blob is recoverable, an orphaned 108 MB blob with no
                    // row referencing it is invisible — which is exactly how this reached 40 GB.
                    if (!/not.?found|404/i.test(e?.message || "")) {
                        failures.push(`${r.channel} v${r.version_code}: ${e?.message}`);
                        continue;
                    }
                }
                // Blob first, row second, and only once the blob is gone.
                await db.query(`DELETE FROM app_release WHERE id = $1`, [r.id]).catch(() => {});
                rowsGone += 1;
            }

            const result = { ok: true, candidates: doomed.length, blobsGone, rowsGone, freedBytes: freed, failures };
            logger.info("jobs.prune_app_releases.done", result);
            return NextResponse.json(result);
        } catch (error) {
            return internalError(error, { event: "jobs.prune_app_releases.failure" });
        }
    });
}
