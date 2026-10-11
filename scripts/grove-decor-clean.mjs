// ── ⚠️ CUT THE ALPHA FLOOR OFF THE LEDGE ART ─────────────────────────────────────────────────────────────────
// gpt-image-1 returns "transparent" at alpha 1 to 3, not 0 — so a die-cut sprite arrives with a full-frame
// fringe of almost-invisible pixels. It is invisible in a viewer and it is NOT invisible in the game: these
// decorations carry a CSS drop-shadow, and drop-shadow follows the alpha channel, so a 2% fringe casts a
// hard rectangular shadow around a vine. See sprite-alpha-floor-drop-shadow-box, which cost a whole set of
// sprites the last time.
//
// It also defeats sharp's trim, which is why every one of the thirteen came back at exactly its full canvas
// size: there is no transparent border to find. Zeroing the floor first is what makes the trim work at all.
//
//   node scripts/grove-decor-clean.mjs
import fs from "node:fs";

import sharp from "sharp";

const DIR = "public/images/grove";
const FLOOR = 12;          // anything under this is the model's idea of transparent, not paint
const SLAB_W = 1024;       // ⚠️ the slab geometry is load-bearing — see the border-image note in grove-css.js
const SLAB_H = 320;

let changed = 0;
for (const file of fs.readdirSync(DIR).filter((f) => /^(slab|hang|sit)-.*\.webp$/.test(f))) {
    const path = `${DIR}/${file}`;
    const src = fs.readFileSync(path);
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let floored = 0;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0 && data[i] < FLOOR) { data[i] = 0; floored += 1; }
    }
    let img = sharp(data, { raw: info }).trim({ threshold: 1 });
    // A slab's end caps are cut from the image edges by border-image at a fixed slice, so its size is part
    // of the stylesheet's arithmetic rather than a property of the picture.
    img = file.startsWith("slab-") ? img.resize(SLAB_W, SLAB_H, { fit: "fill" }) : img;
    const out = await img.webp({ quality: 92 }).toBuffer();
    fs.writeFileSync(path, out);
    const m = await sharp(out).metadata();
    console.log(`  ${file.padEnd(28)} ${String(m.width).padStart(4)}x${String(m.height).padStart(4)}  ${floored} fringe px cleared`);
    changed += 1;
}
console.log(`\n${changed} file(s) cleaned.`);

// ── ⚠️ AND WHERE EACH SLAB'S STANDING SURFACE ACTUALLY IS ────────────────────────────────────────────────────
// Luke: "the enemies and player and pet are floating".
//
// A body's feet are placed at the ledge element's TOP EDGE, which is the top row of the painting — and on a
// mossy slab that row is the tip of the tallest tuft, not the surface. Standing a knight on the apex of a
// cushion of moss is exactly what reads as hovering, and it gets worse the shaggier the slab: the bramble's
// top edge wanders over 13% of its height.
//
// So the surface is MEASURED, not guessed, the same way the `foot` column in GROVE_SIZE was. For every
// column across the slab's middle, find the first opaque row; the MEDIAN of those is the line the eye reads
// as the surface, because half the tufts stand above it and half below. Paste the result into SLAB_SURFACE
// in grove-catalog.js; check-grove.mjs asserts every slab has an entry.
console.log("\n── surface line per slab (paste into SLAB_SURFACE in grove-catalog.js) ──");
for (const file of fs.readdirSync(DIR).filter((f) => /^slab-.*\.webp$/.test(f)).sort()) {
    const { data, info } = await sharp(fs.readFileSync(`${DIR}/${file}`)).ensureAlpha()
        .raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: c } = info;
    const x0 = Math.round(w * 0.16);
    const x1 = Math.round(w * 0.84);
    const tops = [];
    for (let x = x0; x < x1; x += 1) {
        for (let y = 0; y < h; y += 1) {
            if (data[(y * w + x) * c + 3] > 128) { tops.push(y); break; }
        }
    }
    tops.sort((p, q) => p - q);
    const median = tops[Math.floor(tops.length / 2)] || 0;
    const id = file.replace(/^slab-|\.webp$/g, "");
    console.log(`    ${id}:`.padEnd(14) + `${(median / h).toFixed(3)},`.padEnd(9)
        + `// top edge median row ${median} of ${h}`);
}
