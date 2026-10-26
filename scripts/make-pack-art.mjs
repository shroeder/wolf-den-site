#!/usr/bin/env node
// ── THE BAG, CUT OFF THE CARPET ──────────────────────────────────────────────────────────────────────────────
// The only picture of the mystery pack is public/images/mystery_bag.jpg: a 4000x3000 phone photo of the real
// bag lying on a pale carpet. It is the right bag — black matte, gold wolf-in-moon — and it is unusable as a
// game asset while it has a floor behind it.
//
// This is a photo edit, not a generation job. Nothing here invents pixels: it measures where the bag is,
// crops to it, and rounds the corners so the carpet in the rounded corners goes with it.
//
// ⚠️ THE BAG STAYS LANDSCAPE, AND THE LOGO STAYS UPRIGHT. The bag is sqrt(2) aspect and its zip runs down the
// LEFT edge in the photo, so rotating it to put the zip at the top — which is where a card ought to come out —
// would lay the gold wolf on its side. The logo is the brand; a sideways wolf reads as a broken image. So the
// reveal keeps this orientation and has the card rise from BEHIND the bag's top edge, which is how every
// pack-opening animation reads anyway.
//
// ⚠️ EDGES ARE MEASURED, NOT EYEBALLED. The bag is near-black on a pale carpet, so a downscaled greyscale pass
// finds the first and last row/column that are mostly dark. Hard-coded crop numbers would be wrong the moment
// anybody re-shoots the bag.
//
//   node scripts/make-pack-art.mjs [--inset 6]

import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public/images/mystery_bag.jpg");
const OUT_DIR = path.join(ROOT, "public/images/packs");

const args = process.argv.slice(2);
const INSET = Number(args[args.indexOf("--inset") + 1]) || 26; // px of carpet/shadow to shave off each measured edge

/** First and last index whose dark-pixel count clears the threshold. */
function span(counts, threshold) {
    let first = -1;
    let last = -1;
    for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] > threshold) {
            if (first < 0) first = i;
            last = i;
        }
    }
    return [first, last];
}

async function measure(meta) {
    const W = 400;
    const H = Math.round((W * meta.height) / meta.width);
    const { data } = await sharp(SRC).resize(W, H).greyscale().raw().toBuffer({ resolveWithObject: true });

    const DARK = 110; // matte black bag vs pale carpet — a wide gap, so the exact value is not delicate
    const cols = new Array(W).fill(0);
    const rows = new Array(H).fill(0);
    for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
            if (data[y * W + x] < DARK) { cols[x] += 1; rows[y] += 1; }
        }
    }

    // ⚠️ A column counts as "bag" only if MOST of it is dark. At a third, the bag's own drop shadow on the
    //    carpet cleared the bar and the crop came out with a visible grey fringe along the bottom and carpet
    //    in every corner. The shadow is soft and one-sided; the bag is not.
    const [x0, x1] = span(cols, H * 0.62);
    const [y0, y1] = span(rows, W * 0.62);
    if (x0 < 0 || y0 < 0) throw new Error("Could not find the bag in the photo.");

    const scale = meta.width / W;
    return {
        left: Math.round(x0 * scale) + INSET,
        top: Math.round(y0 * scale) + INSET,
        width: Math.round((x1 - x0 + 1) * scale) - INSET * 2,
        height: Math.round((y1 - y0 + 1) * scale) - INSET * 2,
    };
}

/** An SVG rounded rectangle used as an alpha mask, so the bag's own rounded corners lose their carpet. */
function roundedMask(width, height) {
    // Matched to the bag's own corner radius by eye against the output, not guessed from the aspect.
    const r = Math.round(Math.min(width, height) * 0.085);
    return Buffer.from(
        `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
    );
}

const meta = await sharp(SRC).metadata();
const box = await measure(meta);
console.log(`source ${meta.width}x${meta.height}  ->  bag at`, box, `aspect ${(box.width / box.height).toFixed(3)}`);

await sharp(SRC).extract(box).toFile(path.join(OUT_DIR, ".tmp-bag.png")).catch(async (e) => {
    // OUT_DIR may not exist yet.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(OUT_DIR, { recursive: true });
    await sharp(SRC).extract(box).toFile(path.join(OUT_DIR, ".tmp-bag.png"));
    return e;
});

for (const width of [1200, 800]) {
    const height = Math.round((width * box.height) / box.width);
    const body = await sharp(path.join(OUT_DIR, ".tmp-bag.png")).resize(width, height).toBuffer();
    const out = path.join(OUT_DIR, `mystery-bag-${width}.webp`);
    await sharp(body)
        .composite([{ input: roundedMask(width, height), blend: "dest-in" }])
        .webp({ quality: 88 })
        .toFile(out);
    console.log(`wrote ${out}  ${width}x${height}`);
}

const { unlinkSync } = await import("node:fs");
unlinkSync(path.join(OUT_DIR, ".tmp-bag.png"));
