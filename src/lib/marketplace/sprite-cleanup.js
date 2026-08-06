import sharp from "sharp";

// ── SPRITE QUALITY GATE ──────────────────────────────────────────────────────────────────────────────────────
// gpt-image-1 with `background: transparent` returns art with two recurring defects that the raw bytes carry
// straight into the game. Measured across 14 live sprites:
//
//   EDGE CLIPPING   The figure drawn past the canvas edge, so a helmet crest or a pair of feet is guillotined.
//                   5 of 14. The reference we send is a bust sitting flush against the TOP of a square frame,
//                   which anchors the model's composition to the edge and invites it to run off.
//
//   INTERIOR HOLES  Transparent regions punched THROUGH the character — through a breastplate, through a
//                   shield face. The model is over-eager about what counts as background and keys out
//                   interior areas it reads as light.
//
// THIS MODULE ONLY MEASURES. It does not repair, and that is a deliberate reversal.
//
// Repairing holes by re-opaquing them looks obvious — the alpha is straight, not premultiplied, so a keyed-out
// pixel still carries colour underneath. It was tried and it is WRONG. The colour under the alpha is only
// SOMETIMES the real art: filling put a black blob on one member's hip and turned another's bow into a solid
// brown slab, because a bow's interior is *supposed* to be transparent and the RGB beneath it was garbage.
// There is no reliable way to tell a keyed-out hole from intentional negative space after the fact.
//
// So both defects are handled the same way instead: DETECT and REDRAW. A bad draw is rejected and retried,
// which costs one more image and produces art that is actually right, rather than art that has been mangled
// into a different kind of wrong.

const OPAQUE = 128;            // alpha above this counts as "part of the character"
const EDGE_TOLERANCE = 2;      // a couple of stray pixels on an edge is antialiasing, not a cropped foot

/** Flood the background inward from every border pixel. 1 = reachable from outside = true background. */
function backgroundMask(data, w, h) {
    const seen = new Uint8Array(w * h);
    // An explicit stack, not recursion: a 1024x1024 fill is ~1M deep in the worst case and blows the call stack.
    const stack = [];
    for (let x = 0; x < w; x += 1) stack.push(x, 0, x, h - 1);
    for (let y = 0; y < h; y += 1) stack.push(0, y, w - 1, y);
    while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (seen[i] || data[i * 4 + 3] > OPAQUE) continue;
        seen[i] = 1;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    return seen;
}

/**
 * What is wrong with this sprite.
 *
 * `holes` deliberately EXCLUDES the gap between the legs. Nearly every sprite stands on a ground-shadow
 * ellipse, and that ellipse seals the arch between the legs into a region the border flood cannot enter —
 * enclosed, but entirely legitimate. One member's whole 23,946-pixel "hole" count was exactly that and
 * nothing else. What separates them is where they bottom out: a leg gap ends at the character's own feet
 * because the thing sealing it is the shadow they stand on, while a real hole sits well above the base.
 */
export async function inspectSprite(buffer, { footZone = 0.08 } = {}) {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const alpha = (i) => data[i * 4 + 3];

    let top = 0, bottom = 0, left = 0, right = 0;
    for (let x = 0; x < w; x += 1) {
        if (alpha(x) > OPAQUE) top += 1;
        if (alpha((h - 1) * w + x) > OPAQUE) bottom += 1;
    }
    for (let y = 0; y < h; y += 1) {
        if (alpha(y * w) > OPAQUE) left += 1;
        if (alpha(y * w + w - 1) > OPAQUE) right += 1;
    }

    let figureTop = h, figureBottom = -1;
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            if (alpha(y * w + x) > OPAQUE) { if (y < figureTop) figureTop = y; if (y > figureBottom) figureBottom = y; break; }
        }
    }
    const footLine = figureBottom < 0 ? h : figureBottom - (figureBottom - figureTop) * footZone;

    const bg = backgroundMask(data, w, h);
    const label = new Int32Array(w * h).fill(-1);
    let holes = 0;
    let legGap = 0;
    for (let seed = 0; seed < w * h; seed += 1) {
        if (alpha(seed) > OPAQUE || bg[seed] || label[seed] >= 0) continue;
        const id = seed;
        const stack = [seed];
        label[seed] = id;
        let count = 0;
        let lowest = 0;
        while (stack.length) {
            const i = stack.pop();
            count += 1;
            const x = i % w;
            const y = (i / w) | 0;
            if (y > lowest) lowest = y;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const j = ny * w + nx;
                if (label[j] >= 0 || bg[j] || alpha(j) > OPAQUE) continue;
                label[j] = id;
                stack.push(j);
            }
        }
        if (lowest >= footLine) legGap += count; else holes += count;
    }

    const area = Math.max(1, (figureBottom - figureTop) * w);
    return {
        width: w, height: h, top, bottom, left, right,
        holes, legGap,
        // Feet and helmets are the casualties, so top and bottom are what decide "redraw this".
        clipped: top > EDGE_TOLERANCE || bottom > EDGE_TOLERANCE,
        holeRatio: holes / area,
    };
}

/**
 * Is this draw good enough to keep?
 *
 * `holes` is thresholded rather than required to be zero: a few hundred stray pixels are speckle around a
 * sword edge that nobody will ever see, and rejecting on those would burn a redraw on every single sprite.
 */
export function spriteVerdict(report, { maxHoles = 600 } = {}) {
    const problems = [];
    if (report.clipped) problems.push(`cropped at the ${report.top > EDGE_TOLERANCE ? "top" : ""}${report.top > EDGE_TOLERANCE && report.bottom > EDGE_TOLERANCE ? " and " : ""}${report.bottom > EDGE_TOLERANCE ? "bottom" : ""} of the frame`);
    if (report.holes > maxHoles) problems.push(`${report.holes.toLocaleString()} transparent pixels punched through the character`);
    return { ok: problems.length === 0, problems };
}

/**
 * Centre the figure in a square frame with a consistent margin.
 *
 * This is what stops sprites rendering at wildly different apparent sizes beside each other in the arena and
 * on the boss roster: one drawn hip-up and one drawn full-body both come out filling the same box. Purely a
 * transform of existing pixels — it never invents any. A CLIPPED sprite is left alone, because padding a
 * cropped figure just centres the crop and makes it look deliberate.
 */
export async function reframeSprite(buffer, { margin = 0.04 } = {}) {
    const report = await inspectSprite(buffer);
    if (report.clipped) return { buffer, reframed: false, report };

    const trimmed = await sharp(buffer).trim({ threshold: 1 }).toBuffer().catch(() => null);
    if (!trimmed) return { buffer, reframed: false, report };

    const meta = await sharp(trimmed).metadata();
    const side = Math.max(meta.width, meta.height);
    const box = Math.round(side * (1 + margin * 2));
    const out = await sharp({
        create: { width: box, height: box, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite([{ input: trimmed, left: Math.round((box - meta.width) / 2), top: Math.round((box - meta.height) / 2) }])
        .png()
        .toBuffer();
    return { buffer: out, reframed: true, report };
}
