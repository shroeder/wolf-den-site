// ── ONE GOOD FRAME, NOT EIGHT MEDIOCRE ONES ──────────────────────────────────────────────────────────────────
// Multi-frame sprite sheets out of an image model do not work, and this is the script that admits it.
//
// The model draws each cell independently. It does not hold an anchor, a scale or a silhouette across a row —
// so played back, the effect DRIFTS sideways and pulses in size, which reads exactly like a texture sliding
// behind a window rather than like an animation. Add the rescale from a 173px crop up to a 210px box and it is
// blurry as well. Three generations and a normalisation pass did not fix it, because it is not a tuning
// problem: frame-to-frame coherence is something the generator cannot give.
//
// What the model IS very good at is one striking image. So take the single best frame from each sheet at full
// resolution and let CSS transforms do the motion — scale, rotate, fade, translate. That is coherent by
// construction (it is the same pixels moving), it is crisp (256px art shown at ~210px is a DOWNSCALE), and it
// costs nothing extra: this reuses art already generated and paid for.
//
// "Best" = the frame with the most drawn content, which is the peak of the effect rather than its first
// flicker or its dying embers.
//
// Usage: node scripts/extract-arena-vfx-peak.mjs
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const DIR = "public/images/arena/vfx";
const COLS = 4, FRAMES = 8;
const A_FLOOR = 40, A_GAIN = 1.2;
const KEYS = ["rend", "flurry", "drain", "sunder", "riposte", "impact", "spell", "ward"];

const toRgba = (data, info) => {
    const px = info.width * info.height;
    const out = Buffer.alloc(px * 4);
    for (let i = 0; i < px; i += 1) {
        const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
        const lum = Math.max(r, g, b);
        out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
        out[i * 4 + 3] = lum <= A_FLOOR ? 0 : Math.min(255, Math.round((lum - A_FLOOR) * (255 / (255 - A_FLOOR)) * A_GAIN));
    }
    return out;
};

// Radial falloff so nothing can show the cell's straight edge.
function feather(rgba, w, h) {
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    const rMax = Math.min(cx, cy), inner = rMax * 0.84;
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const d = Math.hypot(x - cx, y - cy);
            if (d <= inner) continue;
            const k = Math.max(0, 1 - (d - inner) / Math.max(1, rMax - inner));
            const i = (y * w + x) * 4 + 3;
            rgba[i] = Math.round(rgba[i] * k * k);
        }
    }
    return rgba;
}

for (const key of KEYS) {
    const src = path.join(DIR, `${key}.webp`);
    if (!fs.existsSync(src)) { console.log(`- ${key}: no source`); continue; }
    const meta = await sharp(src).metadata();
    const cell = Math.floor(meta.width / COLS);

    let best = null;
    for (let i = 0; i < FRAMES; i += 1) {
        const top = Math.floor(i / COLS) * cell;
        if (top + cell > meta.height) break;
        const { data, info } = await sharp(src)
            .extract({ left: (i % COLS) * cell, top, width: cell, height: cell })
            .removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const rgba = toRgba(data, info);
        let lit = 0;
        for (let p = 0; p < info.width * info.height; p += 1) if (rgba[p * 4 + 3] > 40) lit += 1;
        if (!best || lit > best.lit) best = { lit, rgba, w: info.width, h: info.height, i };
    }
    if (!best) { console.log(`- ${key}: nothing drawn`); continue; }

    const out = path.join(DIR, `${key}-peak.webp`);
    await sharp(Buffer.from(feather(best.rgba, best.w, best.h)), { raw: { width: best.w, height: best.h, channels: 4 } })
        .webp({ quality: 94, alphaQuality: 100, effort: 5 })
        .toFile(out);
    console.log(`✓ ${key.padEnd(9)} frame ${best.i}  ${best.w}px  (${Math.round(fs.statSync(out).size / 1024)}kb)`);
}
