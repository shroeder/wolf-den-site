// ── THE SURFACE A BODY STANDS ON MUST MATCH THE SLAB THAT IS DRAWN ──────────────────────────────────────────
// Luke: "We're like walking on air, and the enemies are like walking on air on the platforms. It feels like
// the physics aren't lined up properly with the platforms."
//
// SLAB_SURFACE in grove-catalog.js is a MEASURED number per slab — for each column across the slab's middle,
// the first opaque row; the median of those is the line the eye reads as the surface. Its own comment says
// to regenerate it after any art pass, because "a redrawn slab with a different cushion silently moves this
// line". Silently is the word: nothing errors, every body is placed exactly where the table says, and the
// whole game feels weightless.
//
// So this re-measures the eight files and compares them to the table.
//
//   npm run check:slabs
import { readdirSync } from "node:fs";
import sharp from "sharp";

import { SLAB_SURFACE } from "@/lib/marketplace/grove-catalog.js";

const DIR = "public/images/grove";
// ⚠️ MASS, NOT BOUNDING BOX — the same rule the body measurement uses. A single stray pixel of a glow is not
// the surface; a row counts when a real share of it is opaque.
const ALPHA = 40;

/** The median first-opaque row across the middle of the slab, as a fraction of its height. */
async function measure(file) {
    const img = sharp(file);
    const { width, height } = await img.metadata();
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    // The middle half only: the rounded end caps curve away and would drag the median down.
    const from = Math.floor(width * 0.25);
    const to = Math.ceil(width * 0.75);
    const tops = [];
    for (let x = from; x < to; x += 1) {
        for (let y = 0; y < height; y += 1) {
            if (data[(y * width + x) * ch + (ch - 1)] > ALPHA) { tops.push(y); break; }
        }
    }
    if (!tops.length) return null;
    tops.sort((a, b) => a - b);
    const med = tops[Math.floor(tops.length / 2)];
    return { row: med, height, frac: med / height, width };
}

const files = readdirSync(DIR).filter((f) => /^slab-.*\.webp$/.test(f));
let bad = 0;
console.log(`measuring ${files.length} slabs against SLAB_SURFACE\n`);
console.log("  slab       table    measured   row/height     drift");
for (const f of files.sort()) {
    const id = f.replace(/^slab-|\.webp$/g, "");
    const m = await measure(`${DIR}/${f}`);
    if (!m) { console.log(`  ${id.padEnd(9)} — could not measure (fully transparent?)`); bad += 1; continue; }
    const table = SLAB_SURFACE[id];
    if (table === undefined) { console.log(`  ✗ ${id.padEnd(9)} is on disk but not in SLAB_SURFACE`); bad += 1; continue; }
    const drift = m.frac - table;
    // 1% of a 320px slab is ~3px. Below that nobody can see it; above it reads as hovering.
    const off = Math.abs(drift) > 0.01;
    if (off) bad += 1;
    console.log(`  ${off ? "✗" : "✓"} ${id.padEnd(9)} ${table.toFixed(3)}    ${m.frac.toFixed(3)}      ${String(m.row).padStart(3)}/${m.height}`
        + `      ${(drift >= 0 ? "+" : "") + (drift * 100).toFixed(1)}%`
        + (m.width !== 1024 || m.height !== 320 ? `   ⚠ ${m.width}x${m.height}, not 1024x320` : ""));
}
for (const id of Object.keys(SLAB_SURFACE)) {
    if (!files.includes(`slab-${id}.webp`)) { console.log(`  ✗ SLAB_SURFACE has "${id}" but there is no slab-${id}.webp`); bad += 1; }
}
console.log(bad
    ? `\ncheck:slabs — ${bad} slab(s) drifted. Bodies stand on the table, not on the art, so they will float or sink.`
    : "\ncheck:slabs — every slab's painted surface matches the number bodies stand on.");
process.exit(bad ? 1 : 0);
