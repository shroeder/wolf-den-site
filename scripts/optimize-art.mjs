/**
 * Re-encode the game's art at the size it's actually displayed at.
 *
 * Every sprite is stored exactly as OpenAI returned it: a 1024x1024 PNG, 1.5-2.4 MB. They're drawn at 48-148
 * CSS px. That's 1.94 GB of art shipped to phones to paint thumbnails — the biggest single line on the Vercel
 * bill (Blob Data Transfer), and the reason the Town and Farm are slow to open on mobile.
 *
 * Each target below is 3x the LARGEST place that image is ever rendered, which is more pixels than a 3x-DPR
 * phone can display — so nothing gets softer. Backdrops are the exception and keep their dimensions, because
 * they're painted full-width across a scrolling field; they only gain the WebP encode.
 *
 * The original blob is NOT deleted. The optimized file is uploaded alongside it, the live URL is repointed,
 * and old -> new is recorded in mkt_art_optimized (migration 292) so this is revertible and the originals can
 * be swept later.
 *
 * Usage:
 *   node scripts/optimize-art.mjs               # dry run: what would change, and by how much
 *   node scripts/optimize-art.mjs --apply       # do it
 *   node scripts/optimize-art.mjs --revert      # put every old URL back (originals are still there)
 *   node scripts/optimize-art.mjs --sweep       # delete the superseded originals (only after eyeballing)
 *   node scripts/optimize-art.mjs --only=mkt_pet_sprite    # limit to one source, for a cautious first pass
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert");
const SWEEP = process.argv.includes("--sweep");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
const CONCURRENCY = 10;
const QUALITY = 88;

function readSecret(key) {
    if (process.env[key]) return process.env[key];
    for (const p of ["../accounting_app/.env", ".env"]) {
        try {
            const m = readFileSync(p, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
            if (m) return m[1].trim();
        } catch { /* try the next */ }
    }
    return null;
}
const token = readSecret("BLOB_READ_WRITE_TOKEN");
const dbUrl = readSecret("DATABASE_URL");
if (!token || !dbUrl) { console.error("Missing BLOB_READ_WRITE_TOKEN or DATABASE_URL."); process.exit(1); }
const sql = neon(dbUrl);

// Town art is a grab-bag: scrolling backdrop bands, building facades, tiny stat icons. Sizing it as one
// bucket would either blur the backdrops or leave the icons enormous, so it's keyed.
const TOWN_BACKDROPS = new Set(["background", "sky", "mid", "fg", "cobble", "townscape", "centerpiece", "depth1", "depth2", "depth3"]);
const townTarget = (key) => {
    if (TOWN_BACKDROPS.has(key) || /^depth\d+$/.test(key)) return 1600; // painted full-width, tiled across the field
    if (key.startsWith("stat_")) return 192;                            // little stat glyphs
    if (key.startsWith("crop_")) return 384;
    if (key.startsWith("farm_bed")) return 448;
    if (key.startsWith("foe_") || key.startsWith("enc_")) return 448;
    return 512;                                                          // buildings, NPCs, props
};

// [table, column, target width in px, optional per-row keyer for a variable target]
const JOBS = [
    ["mkt_pet_sprite", "url", 448],            // pets render up to 148 CSS px on the farm
    ["mkt_pet_sprite_level", "url", 448],
    ["mkt_item_sprite", "url", 384],           // gear tops out at 128
    ["mkt_consumable_sprite", "url", 384],
    ["mkt_badge_sprite", "url", 384],
    ["mkt_deco_sprite", "url", 384],
    ["mkt_custom_deco", "chosen_url", 384],
    ["mkt_buyer", "avatar_sprite_url", 384],
    ["mkt_buyer", "avatar_url", 384],
    ["mkt_vendor", "logo_url", 512],
    ["mkt_vendor_application", "logo_url", 512],
    ["boss_event", "image_url", 1024],         // battle scene draws the boss up to ~310px tall
    ["boss_event", "background_url", 1600],
    ["mkt_farm_bg", "url", 1600],              // full-width farm backdrop
    ["mkt_buyer", "farm_bg_url", 1600],
    ["mkt_town_art", "url", null, "art_key"],  // per-key, see townTarget
];

const kb = (b) => `${Math.round(b / 1024)} KB`;
const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;

async function ensureTable() {
    await sql.query(`CREATE TABLE IF NOT EXISTS mkt_art_optimized (
        id BIGSERIAL PRIMARY KEY, src_table TEXT NOT NULL, src_column TEXT NOT NULL,
        old_url TEXT NOT NULL, new_url TEXT NOT NULL, old_bytes BIGINT, new_bytes BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_art_optimized_old ON mkt_art_optimized (old_url)`);
}

async function revert() {
    const rows = await sql.query(`SELECT src_table, src_column, old_url, new_url FROM mkt_art_optimized`);
    console.log(`Reverting ${rows.length} images to their originals…`);
    let n = 0;
    for (const r of rows) {
        await sql.query(`UPDATE "${r.src_table}" SET "${r.src_column}" = $1 WHERE "${r.src_column}" = $2`, [r.old_url, r.new_url]);
        n += 1;
    }
    await sql.query(`DELETE FROM mkt_art_optimized`);
    console.log(`Reverted ${n}. The optimized files are still in blob but nothing points at them.`);
}

async function sweep() {
    const rows = await sql.query(`SELECT id, old_url FROM mkt_art_optimized`);
    console.log(`Deleting ${rows.length} superseded originals…`);
    let n = 0; let failed = 0;
    for (const r of rows) {
        try { await del(r.old_url, { token }); n += 1; } catch (e) {
            if (!/not.?found|404/i.test(e?.message || "")) { failed += 1; continue; }
        }
        await sql.query(`DELETE FROM mkt_art_optimized WHERE id = $1`, [r.id]);
        if (n % 100 === 0) console.log(`  … ${n}/${rows.length}`);
    }
    console.log(`Swept ${n} originals${failed ? `, ${failed} failed (left recorded for retry)` : ""}.`);
}

async function main() {
    await ensureTable();
    if (REVERT) return revert();
    if (SWEEP) return sweep();

    // Collect the work: one entry per DISTINCT url (the same sprite can be referenced by several rows).
    const work = new Map(); // url -> { table, column, target }
    for (const [table, column, target, keyCol] of JOBS) {
        if (ONLY && table !== ONLY) continue;
        let rows;
        try {
            rows = await sql.query(
                `SELECT DISTINCT "${column}" AS u${keyCol ? `, "${keyCol}" AS k` : ""} FROM "${table}"
                 WHERE "${column}" LIKE '%blob.vercel-storage.com%' AND "${column}" NOT LIKE '%.webp'`,
            );
        } catch (e) { console.log(`  skip ${table}.${column}: ${e.message}`); continue; }
        for (const r of rows) {
            if (!r.u || work.has(r.u)) continue;
            work.set(r.u, { table, column, target: target ?? townTarget(r.k || "") });
        }
    }
    console.log(`${work.size} images to consider${ONLY ? ` (only ${ONLY})` : ""}.\n`);
    if (!work.size) return;

    const entries = [...work.entries()];
    const results = [];
    let i = 0; let done = 0;

    const worker = async () => {
        while (i < entries.length) {
            const idx = i++;
            const [url, { table, column, target }] = entries[idx];
            try {
                const orig = Buffer.from(await (await fetch(url)).arrayBuffer());
                const meta = await sharp(orig).metadata();
                const out = await sharp(orig)
                    .resize({ width: target, withoutEnlargement: true })
                    .webp({ quality: QUALITY, effort: 5 })
                    .toBuffer();
                // Not worth a rewrite if it barely helps — leave those alone rather than churn the URL.
                const worth = out.length < orig.length * 0.7;
                const rec = { url, table, column, target, from: orig.length, to: out.length, w: meta.width, worth, buf: worth ? out : null };
                results.push(rec);
                if (APPLY && worth) {
                    const name = url.split("/").pop().replace(/\.[a-z0-9]+$/i, "");
                    const blob = await put(`art/${table}/${name}.webp`, out, {
                        access: "public", token, contentType: "image/webp",
                        addRandomSuffix: true, cacheControlMaxAge: 31536000,
                    });
                    await sql.query(`UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`, [blob.url, url]);
                    await sql.query(
                        `INSERT INTO mkt_art_optimized (src_table, src_column, old_url, new_url, old_bytes, new_bytes)
                         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (old_url) DO NOTHING`,
                        [table, column, url, blob.url, orig.length, out.length],
                    );
                    rec.newUrl = blob.url;
                }
            } catch (e) {
                results.push({ url, table, column, error: e?.message || String(e) });
            }
            done += 1;
            if (done % 100 === 0) console.log(`  … ${done}/${entries.length}`);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const ok = results.filter((r) => !r.error && r.worth);
    const skipped = results.filter((r) => !r.error && !r.worth);
    const errs = results.filter((r) => r.error);
    const by = new Map();
    for (const r of ok) {
        const g = by.get(r.table) || { n: 0, from: 0, to: 0 };
        g.n += 1; g.from += r.from; g.to += r.to;
        by.set(r.table, g);
    }
    console.log("\nSOURCE".padEnd(26), "N".padStart(6), "BEFORE".padStart(11), "AFTER".padStart(10), "  SAVED");
    let F = 0; let T = 0;
    for (const [t, g] of [...by.entries()].sort((a, b) => b[1].from - a[1].from)) {
        F += g.from; T += g.to;
        console.log(t.padEnd(26), String(g.n).padStart(6), mb(g.from).padStart(11), mb(g.to).padStart(10), `  ${(100 - g.to / g.from * 100).toFixed(1)}%`);
    }
    console.log("".padEnd(26), String(ok.length).padStart(6), mb(F).padStart(11), mb(T).padStart(10), `  ${F ? (100 - T / F * 100).toFixed(1) : 0}%`);
    if (skipped.length) console.log(`\n${skipped.length} left alone (already small enough that a rewrite wasn't worth it).`);
    if (errs.length) {
        console.log(`\n${errs.length} failed:`);
        for (const e of errs.slice(0, 10)) console.log(`  ${e.table}: ${e.error?.slice(0, 100)}`);
    }
    console.log(APPLY ? "\nApplied. Originals kept — run --sweep once you've looked at the live game, or --revert to undo."
        : "\nDRY RUN — nothing uploaded or changed. Re-run with --apply.");
}

await main();
