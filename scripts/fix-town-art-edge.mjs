// ── ERASE A BLACK BAR BAKED INTO THE EDGE OF A TOWN SPRITE ───────────────────────────────────────────────────
//   node scripts/fix-town-art-edge.mjs            report every affected file, change nothing
//   node scripts/fix-town-art-edge.mjs --apply    erase the bar, re-upload, repoint mkt_town_art
//
// Luke: "I dont like the black line im seeing here, its a small horizontal line by the npc".
//
// ⚠️ IT WAS IN THE ARTWORK, NOT THE CSS, AND EVERY CSS SUSPECT LOOKED GUILTY FIRST. The line sat exactly where
// .tw-building::after paints its contact shadow, and .hw-prop.is-near carries a drop-shadow — the textbook
// cause (see the sprite-alpha-floor note: a "transparent" PNG that comes back at alpha 1-2 makes drop-shadow
// cast a BOX). Both were innocent. Hiding each in turn left the line exactly where it was.
//
// What it actually is: hw_bld_mine's bottom 8 rows are pure rgb(0,0,0) at alpha 242-255, across all 640px —
// a black strip the image generator left on the edge of the die-cut. Drawn at 176px tall it is ~2px, which is
// why it reads as a drawn line rather than as part of the picture.
//
// ⚠️ ERASED, NOT CROPPED. Cropping changes the canvas, and the canvas is what the sprite's placement is
// measured against — the building would shift up by its own bar's height. Zeroing the alpha leaves every
// other pixel exactly where it was.
//
// The new Blob URL is a new path, so nothing is holding a stale copy — see the redrawn-art note about why a
// same-path overwrite would leave everyone looking at the old picture for a day.
import { readFileSync } from "node:fs";
import path from "node:path";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");

function secret(name, file = "../accounting_app/.env") {
    if (process.env[name]) return process.env[name].trim();
    const m = readFileSync(path.resolve(file), "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}
const sql = neon(secret("DATABASE_URL"));
const BLOB = secret("BLOB_READ_WRITE_TOKEN");

// The full-bleed backdrop layers are opaque from edge to edge BY DESIGN — they are the ground and the
// treeline, not die-cut props. Scanning them would report every one of them as a false positive.
const BACKDROP = new Set(["hw_cobble", "hw_depth1", "hw_depth2", "hw_depth3", "hw_fg", "hw_mid", "hw_verge", "hw_sky", "hw_far"]);

// A row counts as "bar" when every pixel that is visible at all is essentially black. The alpha threshold is
// 0, not something higher: the bar on the mine fades out through alpha 17 and alpha 1 before it stops, and
// leaving those behind leaves a fainter version of the same line.
function barRows(data, info) {
    const { width: W, height: H, channels: C } = info;
    const isBar = (y) => {
        let seen = 0;
        for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * C;
            if (data[i + 3] === 0) continue;
            if (data[i] > 16 || data[i + 1] > 16 || data[i + 2] > 16) return false;
            seen += 1;
        }
        return seen > W * 0.9;
    };
    let n = 0;
    for (let y = H - 1; y >= 0 && isBar(y); y -= 1) n += 1;
    return n;
}

const rows = await sql`SELECT art_key, url FROM mkt_town_art ORDER BY art_key`;
const hits = [];
for (const r of rows) {
    if (BACKDROP.has(r.art_key) || !/^https?:/.test(r.url || "")) continue;
    const buf = Buffer.from(await (await fetch(r.url)).arrayBuffer());
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = barRows(data, info);
    // A guard against eating real art: a legitimate sprite never ends in a full-width black strip, but if a
    // file somehow does for a tenth of its height, that is a different problem and not this script's to fix.
    if (n > 0 && n < info.height * 0.05) hits.push({ ...r, n, info, buf });
    else if (n > 0) console.log(`  ${r.art_key}: ${n} black rows is too many to be an edge artefact — skipped, look at it by hand`);
}

if (!hits.length) { console.log("no town sprite has a black bar on its edge."); process.exit(0); }
for (const h of hits) console.log(`  ${h.art_key.padEnd(18)} ${h.info.width}x${h.info.height}  ${h.n} black row(s) on the bottom edge`);
if (!APPLY) { console.log(`\n${hits.length} file(s) would be repaired. Nothing written — pass --apply.`); process.exit(0); }

for (const h of hits) {
    const { width: W, height: H, channels: C } = h.info;
    const { data } = await sharp(h.buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = H - h.n; y < H; y += 1) for (let x = 0; x < W; x += 1) data[(y * W + x) * C + 3] = 0;

    const out = await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
    const blob = await put(`marketplace/town/${h.art_key}-${Date.now()}.png`, out, {
        access: "public", contentType: "image/png", cacheControlMaxAge: 31536000, token: BLOB,
    });
    await sql`UPDATE mkt_town_art SET url = ${blob.url}, updated_at = NOW() WHERE art_key = ${h.art_key}`;
    console.log(`  ${h.art_key}: erased ${h.n} row(s) -> ${blob.url}`);
}
console.log(`\nrepaired ${hits.length}.`);
