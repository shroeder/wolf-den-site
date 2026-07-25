import "server-only";

// Future-proofing for the AI "die-cut sticker" white halo: a safe, self-contained de-halo pass for generated
// sprites. It peels the ring of near-white opaque pixels that hugs a subject's transparent edge, stopping at
// the first real (non-white) subject pixel — a dark ink outline acts as a firewall, and interior white (a
// flower center) is unreachable so it's preserved. It ONLY commits the result when the peel is clean; on a
// pale/no-outline subject where the peel would leave a ragged fringe, it returns the ORIGINAL untouched (never
// degrades). Wire it into generateImage({ deHalo: true }) for any die-cut sprite generation.

const DEFAULTS = { passes: 20, white: 228, sat: 34, alphaCleared: 40, stripRim: true, rimMin: 120, rimSat: 24, feather: true };
const MIN_REMOVED = 300;        // below this = there was no real halo -> no-op
const MAX_REMAINING_CLEAN = 800; // white-on-edge left above this = ragged -> keep original (calibrated on real sprites)

// Peels in place. Returns { removed, whiteRemainingOnEdge }.
function peel(data, w, h, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const idx = (x, y) => (y * w + x) * 4;
    const isCleared = (i) => data[i + 3] < o.alphaCleared;
    const isNearWhite = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b); return mn > o.white && mx - mn < o.sat; };
    const isLightNeutral = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b); return mn > o.rimMin && mx - mn < o.rimSat; };
    const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const touchesCleared = (x, y) => { for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true; if (isCleared(idx(nx, ny))) return true; } return false; };
    let removed = 0;
    if (o.stripRim) {
        const strip = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = idx(x, y); if (isCleared(i) || !isLightNeutral(i)) continue; if (touchesCleared(x, y)) strip.push(i); }
        for (const i of strip) { data[i + 3] = 0; removed++; }
    }
    for (let pass = 0; pass < o.passes; pass++) {
        const toClear = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = idx(x, y); if (isCleared(i) || !isNearWhite(i)) continue; if (touchesCleared(x, y)) toClear.push(i); }
        if (!toClear.length) break;
        for (const i of toClear) { data[i + 3] = 0; removed++; }
    }
    let whiteRemainingOnEdge = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = idx(x, y); if (isCleared(i)) continue;
        let t = 0; for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || isCleared(idx(nx, ny))) t++; }
        if (!t) continue;
        if (isNearWhite(i)) whiteRemainingOnEdge++;
        if (o.feather) data[i + 3] = Math.round(data[i + 3] * (1 - Math.min(t, 4) / 8));
    }
    return { removed, whiteRemainingOnEdge };
}

// De-halo a PNG buffer. Returns the cleaned buffer, or the ORIGINAL if there was no halo / the peel would be
// ragged. Never throws for image reasons — on any failure it returns the input unchanged.
export async function deHaloBuffer(pngBuffer) {
    try {
        const sharp = (await import("sharp")).default;
        const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { removed, whiteRemainingOnEdge } = peel(data, info.width, info.height);
        if (removed < MIN_REMOVED || whiteRemainingOnEdge > MAX_REMAINING_CLEAN) return pngBuffer; // no halo, or would be ragged -> keep original
        return await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    } catch {
        return pngBuffer;
    }
}
