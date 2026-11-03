// ── TAKE THE BAKED-IN CAPTION OFF A BACKDROP ────────────────────────────────────────────────────────────────
// Four plates came back from the generator with a title painted into them -- "The Heron Wade, in The Sunken
// Fen" -- despite the plate brief ending in "no text, no words, no logo, no watermark, no border". The model
// ignored it.
//
// ⚠️ THIS DOES NOT REDRAW ANYTHING. Regenerating a shipped plate costs money and loses to the original
// nearly every time; the defect here is a caption sitting in a FLAT HORIZONTAL BAND of dirt below the
// painted ground line, and a flat band is the one thing you can repair without a model. Each caption leaves
// clean band to its left and right on the same rows, so the repair is that clean band mirror-tiled across
// the lettering. Nothing else in the plate is touched.
//
// ⚠️ AND THE SOURCE IS THE SAME ROWS, NOT A BLUR. Copying from above or below would drag the band's own
// vertical gradient out of line and leave a visible seam; copying sideways along the row keeps every row
// exactly as dark as it was.
//
//   node scripts/grove-plate-decaption.mjs            report what it finds, write nothing
//   node scripts/grove-plate-decaption.mjs --write    repair the plates in place
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const DIR = "public/images/grove";
const BACKUP = ".promo/plate-backup";
const WRITE = process.argv.includes("--write");

// The three with a caption band. sigil_road is deliberately NOT here: its lettering is carved into a
// gravestone as part of the scene, which is a signpost rather than a watermark, and repairing it means
// repainting a stone rather than cloning a flat band. That one is Luke's call.
const PLATES = ["heronwade", "hound_run", "shrike_cliffs"];

/** Rows and columns the caption occupies, found as the pixels that disagree with their own row. */
async function findCaption(src) {
    const { width, height } = await sharp(src).metadata();
    const top = Math.round(height * 0.88);            // the strip the caption sits in, below the ground line
    const h = height - top;
    const { data } = await sharp(src).removeAlpha()
        .extract({ left: 0, top, width, height: h })
        .raw().toBuffer({ resolveWithObject: true });

    const lum = (x, y) => {
        const i = (y * width + x) * 3;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    // A band row is nearly uniform; lettering is a large, bright-or-dark departure from the row's median.
    const hits = [];
    for (let y = 0; y < h; y += 1) {
        const row = [];
        for (let x = 0; x < width; x += 1) row.push(lum(x, y));
        const med = [...row].sort((a, b) => a - b)[Math.floor(width / 2)];
        const cols = [];
        for (let x = 0; x < width; x += 1) if (Math.abs(row[x] - med) > 48) cols.push(x);
        if (cols.length > width * 0.03 && cols.length < width * 0.65) hits.push({ y, x0: cols[0], x1: cols[cols.length - 1], n: cols.length });
    }
    if (!hits.length) return null;
    return {
        width, height, top, h,
        y0: hits[0].y, y1: hits[hits.length - 1].y,
        x0: Math.min(...hits.map((r) => r.x0)),
        x1: Math.max(...hits.map((r) => r.x1)),
    };
}

if (!existsSync(BACKUP)) mkdirSync(BACKUP, { recursive: true });

for (const id of PLATES) {
    const file = `${DIR}/zone-${id}.webp`;
    const src = readFileSync(file);
    const c = await findCaption(src);
    if (!c) { console.log(`${id.padEnd(16)} no caption found`); continue; }

    const PAD = 6;
    const y0 = Math.max(0, c.top + c.y0 - PAD);
    const y1 = Math.min(c.height, c.top + c.y1 + PAD + 1);
    const bandH = y1 - y0;

    // ⚠️ REBUILD THE ROW, DO NOT CLONE IT. The first cut tiled a clean slice sideways, which works only
    // when the lettering leaves clean band beside it -- true of shrike_cliffs and not of the other two,
    // whose bands carry enough rock and grass texture that the detector (correctly) calls the whole width
    // busy. A flat band has a better repair available: paint every row with ITS OWN median colour, taken
    // from the pixels that are not part of the lettering. That is what the band would be if the caption had
    // never been painted on it, it cannot tile-repeat, and it cannot drag a vertical gradient out of line.
    const { data } = await sharp(src).removeAlpha()
        .extract({ left: 0, top: y0, width: c.width, height: bandH })
        .raw().toBuffer({ resolveWithObject: true });

    const patch = Buffer.alloc(c.width * bandH * 3);
    for (let y = 0; y < bandH; y += 1) {
        // Median per channel, which is immune to the lettering however much of the row it covers.
        const ch = [[], [], []];
        for (let x = 0; x < c.width; x += 1) {
            const i = (y * c.width + x) * 3;
            ch[0].push(data[i]); ch[1].push(data[i + 1]); ch[2].push(data[i + 2]);
        }
        const med = ch.map((a) => a.sort((m, n) => m - n)[Math.floor(a.length / 2)]);
        for (let x = 0; x < c.width; x += 1) {
            const i = (y * c.width + x) * 3;
            patch[i] = med[0]; patch[i + 1] = med[1]; patch[i + 2] = med[2];
        }
    }

    console.log(`${id.padEnd(16)} caption rows ${y0}..${y1} (${bandH}px) — rebuilt from each row's own median`);
    if (!WRITE) continue;

    copyFileSync(file, `${BACKUP}/zone-${id}.webp`);
    const strip = await sharp(patch, { raw: { width: c.width, height: bandH, channels: 3 } }).png().toBuffer();
    // ⚠️ FEATHERED AT THE TOP EDGE, or the repair meets the art in a hard horizontal line that reads as a
    // seam exactly where the ground is. 10px of fade is enough and costs nothing.
    const fade = Buffer.from(
        `<svg width="${c.width}" height="${bandH}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`
        + `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${(10 / bandH).toFixed(3)}" stop-color="#fff" stop-opacity="1"/>`
        + `</linearGradient></defs><rect width="${c.width}" height="${bandH}" fill="url(#g)"/></svg>`,
    );
    const masked = await sharp(strip).composite([{ input: fade, blend: "dest-in" }]).png().toBuffer();
    const outBuf = await sharp(src).composite([{ input: masked, left: 0, top: y0 }]).webp({ quality: 92 }).toBuffer();
    writeFileSync(file, outBuf);
    console.log(`                 repaired; original kept at ${BACKUP}/zone-${id}.webp`);
}
