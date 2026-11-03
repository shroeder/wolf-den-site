// ── WHERE THE PAINTED GROUND ACTUALLY IS, PER BACKDROP ──────────────────────────────────────────────────────
// Luke: "the ground goes way below the camera viewport, but the enemies don't scale with it" and "We're like
// walking on air... it feels like the physics aren't lined up properly with the platforms."
//
// grove-view.js places every body at:
//
//     export const GROUND_OF_PLATE = 0.13;   // "the painted ground about an eighth of the way up"
//
// One authored number, for eighty-four separately generated backdrops. "About" is doing a lot of work: in the
// Stalk Field the painted grass sits nearer a fifth of the way up, so bodies stand ~70px BELOW it, down in
// the dirt band — which is exactly the screenshot of creatures underground.
//
// This is the same lesson as SLAB_SURFACE, which was learned on the ledges and never applied to the floor:
// ⚠️ A PAINTED SURFACE IS MEASURED, NOT AUTHORED.
//
// HOW IT IS MEASURED. A backdrop is opaque, so there is no alpha edge to find. What separates the floor from
// the scene is that the floor is HORIZONTALLY UNIFORM — a band of grass or dirt drawn flat across the plate —
// while the scenery above it is not. So for each row in the bottom 40%, take the variance of pixel luminance
// across the row; the ground line is the highest row from which variance stays low all the way down.
//
//   node scripts/measure-ground-line.mjs            print every plate
//   node scripts/measure-ground-line.mjs --write    print the table to paste into grove-view.js
import { readdirSync } from "node:fs";
import sharp from "sharp";

const DIR = "public/images/grove";
const AUTHORED = 0.13;

async function groundOf(file) {
    const img = sharp(file).removeAlpha();
    const { width, height } = await img.metadata();
    // Downscale: the line is a band, not a pixel, and 200px of width is plenty of signal for a variance.
    const w = 200;
    const h = Math.round((height / width) * w);
    const { data } = await img.resize(w, h).raw().toBuffer({ resolveWithObject: true });
    const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    const rowVar = [];
    for (let y = 0; y < h; y += 1) {
        let s = 0, s2 = 0;
        for (let x = 0; x < w; x += 1) { const v = lum((y * w + x) * 3); s += v; s2 += v * v; }
        rowVar.push(s2 / w - (s / w) ** 2);
    }
    // A flat band is quiet relative to the plate as a whole.
    const sorted = [...rowVar].sort((a, b) => a - b);
    const quiet = sorted[Math.floor(sorted.length * 0.35)];
    // Walk up from the bottom while rows stay quiet; the first noisy row is the horizon.
    let y = h - 1;
    while (y > h * 0.5 && rowVar[y] <= quiet * 2.2) y -= 1;
    const frac = (h - 1 - y) / h;
    return { frac, h, width, height };
}

const files = readdirSync(DIR).filter((f) => /^zone-.*\.webp$/.test(f)).sort();
const out = [];
for (const f of files) {
    try {
        const m = await groundOf(`${DIR}/${f}`);
        out.push({ id: f.replace(/^zone-|\.webp$/g, ""), frac: m.frac });
    } catch (e) { out.push({ id: f, frac: null, err: e.message }); }
}

const ok = out.filter((r) => r.frac != null);
const fracs = ok.map((r) => r.frac).sort((a, b) => a - b);
const med = fracs[Math.floor(fracs.length / 2)];
const off = ok.filter((r) => Math.abs(r.frac - AUTHORED) > 0.03);

console.log(`${ok.length} backdrops measured. GROUND_OF_PLATE is ${AUTHORED} for all of them.\n`);
console.log(`  median measured ground line : ${med.toFixed(3)}`);
console.log(`  range                       : ${fracs[0].toFixed(3)} .. ${fracs[fracs.length - 1].toFixed(3)}`);
console.log(`  more than 3 points off 0.13 : ${off.length} of ${ok.length}\n`);
console.log("  worst offenders (a body stands this far from the painted floor):");
for (const r of [...ok].sort((a, b) => Math.abs(b.frac - AUTHORED) - Math.abs(a.frac - AUTHORED)).slice(0, 12)) {
    console.log(`    ${r.id.padEnd(22)} ${r.frac.toFixed(3)}   ${(r.frac - AUTHORED >= 0 ? "+" : "") + ((r.frac - AUTHORED) * 100).toFixed(1)} pts`);
}

if (process.argv.includes("--write")) {
    console.log("\n\nexport const GROUND_OF_ZONE = {");
    for (const r of ok) console.log(`    "${r.id}": ${r.frac.toFixed(3)},`);
    console.log("};");
}
