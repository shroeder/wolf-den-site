import "server-only";

// ── THE DOORWAY YOU CAN SEE THE SKY THROUGH ──────────────────────────────────────────────────────────────
// A die-cut sprite is generated on a transparent background, and the model does not distinguish between "the
// space around the building" and "the dark inside the building's doorway". Asked for a dungeon mouth with
// "steps leading down into darkness" it draws the darkness by leaving it EMPTY — so the finished sprite has a
// hole where the entrance should be, and in the town the forest and the moon show through the door.
//
// Measured on the one that prompted this (hw_bld_delves): 26,906 fully transparent pixels, 6.6% of the image,
// none of them reachable from the border. Telling the model not to do it did not work; it is not really a
// drawing mistake, it is the background convention meeting a subject that has a hole in it.
//
// ⚠️ THIS IS NOT THE SAME JOB AS dehalo.js AND MUST RUN AFTER IT. De-halo peels a near-white RIM inward from
// the transparent edge and deliberately cannot reach an interior, because an interior white is usually real
// (the middle of a flower). This fills what de-halo is not allowed to touch: transparent regions that are
// SEALED — not reachable from any border pixel — which for a building is always a window, an archway or a
// door and never the background.
//
// The fill is composited UNDER what is already there rather than written over it, so the soft edge the model
// drew around the opening survives and the join does not turn into a cut-out.

const TRANSPARENT = 24;   // alpha at or below this counts as "not drawn" for the purposes of the flood

const hexToRgb = (hex) => {
    const m = String(hex).replace("#", "");
    const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/**
 * Fill every sealed transparent region of a sprite with `hex`.
 *
 * Returns the original buffer untouched when there is nothing sealed to fill, which is the common case — a
 * sprite with no openings costs one flood and no re-encode.
 */
export async function fillHolesBuffer(input, hex = "#0d1020") {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const alphaAt = (x, y) => data[(y * W + x) * 4 + 3];

    // Flood the transparent background inward from every border pixel. Anything transparent this does NOT
    // reach is enclosed by the subject, which is the definition of an opening.
    const outside = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x += 1) { stack.push(x, 0, x, H - 1); }
    for (let y = 0; y < H; y += 1) { stack.push(0, y, W - 1, y); }
    while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = y * W + x;
        if (outside[k]) continue;
        if (alphaAt(x, y) > TRANSPARENT) continue;
        outside[k] = 1;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }

    const { r, g, b } = hexToRgb(hex);
    let filled = 0;
    for (let k = 0; k < W * H; k += 1) {
        const i = k * 4;
        const a = data[i + 3];
        if (a === 255 || outside[k]) continue;
        // Composite what the model drew OVER the fill, so a feathered opening edge stays feathered.
        const f = a / 255;
        data[i] = Math.round(data[i] * f + r * (1 - f));
        data[i + 1] = Math.round(data[i + 1] * f + g * (1 - f));
        data[i + 2] = Math.round(data[i + 2] * f + b * (1 - f));
        data[i + 3] = 255;
        filled += 1;
    }
    if (!filled) return input;

    return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
