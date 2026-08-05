// ── NORMALISE THE VFX SHEETS ─────────────────────────────────────────────────────────────────────────────────
// The generated sheets are good ART and inconsistent ASSETS. Rendered side by side at the size they actually
// play (see the bench at /marketplace/arena/lab?fx=1) three faults were obvious and none of them are fixable
// in CSS:
//
//   1. HARD RECTANGULAR EDGES. Some effects run to the edge of their cell, so slicing leaves a visible seam —
//      `strike` and `execute` played as a literal orange RECTANGLE floating in the air, and `ward` had a crop
//      line straight through it. Alpha-from-brightness cannot help: the pixels really are bright to the edge.
//   2. WILD SCALE VARIANCE. `rend` and `ward` fill their cell; `flurry` and `riposte` occupy a tenth of it. At
//      one playback size that is the difference between a screen-filling effect and a speck.
//   3. FLOATING. Content sits wherever the model drew it in the cell, mostly high, so effects played above the
//      fighter instead of on them.
//
// So every sheet is re-cut here: find what is actually drawn, crop to it, scale it to a consistent share of
// the frame, sit it on a common baseline, and feather the edges so nothing can ever show a seam again.
//
// Idempotent-ish: it works from the ORIGINAL 4x2 sheet each time, never from a previous pass.
//
// Usage: node scripts/normalize-arena-vfx.mjs
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const DIR = "public/images/arena/vfx";
const FRAMES = 8, COLS = 4, ROWS = 2, CELL = 192;
const FILL = 0.9;        // how much of the frame the widest moment of an effect should occupy
const BASELINE = 0.94;   // where the bottom of the content sits, as a fraction of frame height
const FEATHER = 0.16;   // fraction of the radius over which alpha falls to zero at the edge

const KEYS = ["rend", "flurry", "drain", "sunder", "riposte", "impact", "spell", "ward", "surge", "gamble"];

// Alpha from brightness — bright pixels opaque, black invisible. Soft embers stay soft.
//
// FLOOR AND GAIN. A generated sheet is not clean black in its dark regions: it carries compression blocks a
// few levels above zero, and mapping those straight to alpha printed them as faint RECTANGULAR BLOCKS over
// the arena (clearly visible on gamble and ward). Everything under the floor is crushed to nothing, and what
// survives is re-gained so the effect does not get dimmer for the trouble.
const A_FLOOR = 40;
const A_GAIN = 1.2;
function toRgba(data, info) {
    const px = info.width * info.height;
    const out = Buffer.alloc(px * 4);
    for (let i = 0; i < px; i += 1) {
        const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
        const lum = Math.max(r, g, b);
        const a = lum <= A_FLOOR ? 0 : Math.min(255, Math.round((lum - A_FLOOR) * (255 / (255 - A_FLOOR)) * A_GAIN));
        out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
        out[i * 4 + 3] = a;
    }
    return out;
}

// What is actually drawn in this frame.
function bbox(rgba, w, h, threshold = 24) {
    let minx = w, miny = h, maxx = -1, maxy = -1;
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            if (rgba[(y * w + x) * 4 + 3] > threshold) {
                if (x < minx) minx = x; if (x > maxx) maxx = x;
                if (y < miny) miny = y; if (y > maxy) maxy = y;
            }
        }
    }
    if (maxx < 0) return null;
    return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
}

// A RADIAL falloff so an effect that ran to the edge of its cell dissolves instead of ending in a line.
// The first version faded per-axis, which on content that fills the frame leaves a visibly BOXY haze — you
// could see the rectangle it was trying to hide. Distance from centre has no corners.
function feather(rgba, w, h) {
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    const rMax = Math.min(cx, cy);
    const inner = rMax * (1 - FEATHER);
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

let done = 0;
for (const key of KEYS) {
    const src = path.join(DIR, `${key}.webp`);
    if (!fs.existsSync(src)) { console.log(`- ${key}: no source sheet`); continue; }
    const meta = await sharp(src).metadata();
    // CELLS ARE SQUARE. Deriving cell height from (imageHeight / 2) was wrong: the model kept laying these
    // out as a 4x4 grid with the top eight cells used, whatever the prompt asked for — so a "row" of a
    // 1024x1024 sheet is 256 tall, not 512, and halving the image lumped TWO frames into one cell. That is
    // why the measured content came back as 256x512 and every effect was squashed into a narrow column.
    const cw = Math.floor(meta.width / COLS);
    const ch = cw;

    // Pass 1 — read every frame and find the UNION of what is drawn, so the whole animation is cropped
    // consistently. Per-frame cropping would make the effect jitter as its own bounds changed.
    const frames = [];
    let union = null;
    for (let i = 0; i < FRAMES; i += 1) {
        const { data, info } = await sharp(src)
            .extract({ left: (i % COLS) * cw, top: Math.floor(i / COLS) * ch, width: cw, height: ch })
            .removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const rgba = toRgba(data, info);
        frames.push({ rgba, w: info.width, h: info.height });
        const b = bbox(rgba, info.width, info.height);
        if (b) {
            union = union ? {
                x: Math.min(union.x, b.x), y: Math.min(union.y, b.y),
                r: Math.max(union.r, b.x + b.w), b2: Math.max(union.b2, b.y + b.h),
            } : { x: b.x, y: b.y, r: b.x + b.w, b2: b.y + b.h };
        }
    }
    if (!union) { console.log(`- ${key}: nothing drawn`); continue; }
    const uw = union.r - union.x, uh = union.b2 - union.y;

    // Pass 2 — crop to the union, scale to a consistent share of the frame, sit on the baseline, feather.
    const target = Math.round(CELL * FILL);
    const scale = target / Math.max(uw, uh);
    const dw = Math.max(1, Math.round(uw * scale)), dh = Math.max(1, Math.round(uh * scale));
    const left = Math.round((CELL - dw) / 2);
    const top = Math.max(0, Math.round(CELL * BASELINE - dh));

    const cells = [];
    for (let i = 0; i < FRAMES; i += 1) {
        const f = frames[i];
        const cut = await sharp(Buffer.from(f.rgba), { raw: { width: f.w, height: f.h, channels: 4 } })
            .extract({ left: union.x, top: union.y, width: uw, height: uh })
            .raw().toBuffer();
        const cropped = await sharp(Buffer.from(feather(cut, uw, uh)), { raw: { width: uw, height: uh, channels: 4 } })
            .resize(dw, dh, { fit: "fill" })
            // Raw in needs an explicit format out, or sharp cannot tell what to encode.
            .png().toBuffer();
        const cell = await sharp({ create: { width: CELL, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: cropped, left, top }]).png().toBuffer();
        cells.push({ input: cell, left: i * CELL, top: 0 });
    }
    const out = path.join(DIR, `${key}-strip.webp`);
    await sharp({ create: { width: CELL * FRAMES, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(cells).webp({ quality: 96, alphaQuality: 100, effort: 5 }).toFile(out);
    done += 1;
    console.log(`✓ ${key.padEnd(9)} content ${uw}x${uh} → ${dw}x${dh}  (${Math.round(fs.statSync(out).size / 1024)}kb)`);
}
console.log(`\nnormalised ${done}/${KEYS.length}`);
