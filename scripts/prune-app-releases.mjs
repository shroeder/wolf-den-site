/**
 * Prune superseded APK builds from Vercel Blob.
 *
 * The self-updater only ever serves the newest build of a channel — both readers (GET /api/app/version and
 * /app) do `ORDER BY version_code DESC LIMIT 1`. Nothing reads an older row, so every build below the top of
 * its channel is unreachable bytes. They had grown to ~40 GB, i.e. 95% of the whole blob store.
 *
 * KEEP is 3, not 1, deliberately: because the lookup takes the highest version_code, deleting the newest row
 * promotes the previous one back to current. That's a working rollback for a bad build, and the extra two
 * builds per channel cost ~0.6 GB against the ~53 GB this frees.
 *
 * Usage:
 *   node scripts/prune-app-releases.mjs            # dry run — lists what would go, changes nothing
 *   node scripts/prune-app-releases.mjs --apply    # delete the blobs, then the rows
 *
 * Blobs are deleted BEFORE their rows, and a row is only dropped once its blob is gone. A crash therefore
 * leaves a row pointing at a missing file (visible, fixable) rather than an orphaned 100 MB blob with nothing
 * referencing it (invisible, and exactly how this got to 40 GB).
 */
import { readFileSync } from "node:fs";
import { del } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const KEEP = 3;
const APPLY = process.argv.includes("--apply");

function readSecret(key) {
    if (process.env[key]) return process.env[key];
    for (const p of ["../accounting_app/.env", ".env"]) {
        try {
            const m = readFileSync(p, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
            if (m) return m[1].trim();
        } catch { /* not there — try the next one */ }
    }
    return null;
}

const token = readSecret("BLOB_READ_WRITE_TOKEN");
const dbUrl = readSecret("DATABASE_URL");
if (!token || !dbUrl) {
    console.error("Missing BLOB_READ_WRITE_TOKEN or DATABASE_URL (checked env and ../accounting_app/.env).");
    process.exit(1);
}
const sql = neon(dbUrl);
const gb = (b) => `${(Number(b) / 1e9).toFixed(2)} GB`;

const doomed = await sql.query(
    `WITH ranked AS (
         SELECT id, channel, version_code, version_name, apk_url, size_bytes, created_at,
                row_number() OVER (PARTITION BY channel ORDER BY version_code DESC) AS rn
         FROM app_release
     )
     SELECT id, channel, version_code, version_name, apk_url, size_bytes, created_at
     FROM ranked WHERE rn > $1 ORDER BY channel, version_code DESC`,
    [KEEP],
);
const kept = await sql.query(
    `WITH ranked AS (SELECT channel, version_code, row_number() OVER (PARTITION BY channel ORDER BY version_code DESC) rn FROM app_release)
     SELECT channel, array_agg(version_code ORDER BY version_code DESC) codes FROM ranked WHERE rn <= $1 GROUP BY channel ORDER BY channel`,
    [KEEP],
);

console.log(`Keeping the newest ${KEEP} per channel:`);
for (const k of kept) console.log(`  ${String(k.channel).padEnd(12)} v${k.codes.join(", v")}`);
const totalBytes = doomed.reduce((s, r) => s + Number(r.size_bytes || 0), 0);
console.log(`\n${doomed.length} superseded builds → ${gb(totalBytes)}`);
const byChannel = {};
for (const r of doomed) {
    const c = (byChannel[r.channel] ||= { n: 0, b: 0, lo: Infinity, hi: -Infinity });
    c.n += 1; c.b += Number(r.size_bytes || 0);
    c.lo = Math.min(c.lo, r.version_code); c.hi = Math.max(c.hi, r.version_code);
}
for (const [ch, c] of Object.entries(byChannel)) console.log(`  ${ch.padEnd(12)} ${String(c.n).padStart(4)} builds  v${c.lo}–v${c.hi}  ${gb(c.b)}`);

if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --apply to actually prune.");
    process.exit(0);
}

let blobsGone = 0; let rowsGone = 0; let freed = 0; const failures = [];
for (const r of doomed) {
    try {
        if (r.apk_url) await del(r.apk_url, { token });
        blobsGone += 1;
        freed += Number(r.size_bytes || 0);
    } catch (e) {
        // A 404 means the blob is already gone — the row is still safe to drop.
        const gone = /not.?found|404/i.test(e?.message || "");
        if (!gone) { failures.push(`${r.channel} v${r.version_code}: ${e?.message}`); continue; }
    }
    await sql.query(`DELETE FROM app_release WHERE id = $1`, [r.id]);
    rowsGone += 1;
    if (rowsGone % 50 === 0) console.log(`  … ${rowsGone}/${doomed.length} (${gb(freed)} freed)`);
}

console.log(`\nDeleted ${blobsGone} blobs and ${rowsGone} rows — ${gb(freed)} freed.`);
if (failures.length) {
    console.log(`${failures.length} failed (rows left in place so they can be retried):`);
    for (const f of failures.slice(0, 20)) console.log("  " + f);
}
