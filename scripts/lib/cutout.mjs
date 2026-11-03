// ── KNOCK THE WHITE STUDIO BACKGROUND OFF A PRODUCT PHOTO ───────────────────────────────────────────────────
// Publisher product shots are JPEGs on pure white. Dropped onto a dark poster that reads as a white card
// pasted on top of the design, which is exactly how an ad looks homemade.
//
// ⚠️ A THRESHOLD ALONE IS THE WRONG TOOL, and it is the obvious one. "Make every near-white pixel
// transparent" also eats the white INSIDE the picture — the 15 CARDS text, the 13+ roundels, the white
// warning label on the box — and punches holes through the product.
//
// So it is a FLOOD FILL from the edges: only white that is connected to the border of the frame is
// background. White enclosed by the product is unreachable from outside and survives.
//
// The edge is then feathered by one pixel, because a hard alpha cut on a photo leaves a bright fringe --
// the same halo the house rule about sticker rims and outlines exists to avoid.
import sharp from "sharp";

/**
 * @param {string} src  path to the product photo
 * @param {string} out  path to write a cut-out PNG
 * @param {number} tol  how close to white counts as background (0-255, higher = more aggressive)
 */
export async function cutWhiteBackground(src, out, tol = 26) {
    const img = sharp(src).ensureAlpha();
    const { width: w, height: h } = await img.metadata();
    const { data } = await img.raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => (y * w + x) * 4;
    const isWhite = (i) => data[i] >= 255 - tol && data[i + 1] >= 255 - tol && data[i + 2] >= 255 - tol;

    // Flood fill inward from every border pixel that is white.
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const p = y * w + x;
        if (seen[p]) return;
        seen[p] = 1;
        if (isWhite(at(x, y))) stack.push(p);
    };
    for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }

    const bg = new Uint8Array(w * h);
    while (stack.length) {
        const p = stack.pop();
        bg[p] = 1;
        const x = p % w, y = (p / w) | 0;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    // Feather: a pixel that is background keeps alpha 0; a kept pixel touching background is softened, so
    // the cut does not leave a bright rim against a dark poster.
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const p = y * w + x;
            const i = at(x, y);
            if (bg[p]) { data[i + 3] = 0; continue; }
            let touching = 0;
            if (x > 0 && bg[p - 1]) touching += 1;
            if (x < w - 1 && bg[p + 1]) touching += 1;
            if (y > 0 && bg[p - w]) touching += 1;
            if (y < h - 1 && bg[p + w]) touching += 1;
            if (touching) data[i + 3] = 150;
        }
    }

    const kept = bg.reduce((a, v) => a + (v ? 0 : 1), 0);
    await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);
    return { width: w, height: h, keptPct: Math.round((kept / (w * h)) * 100) };
}
