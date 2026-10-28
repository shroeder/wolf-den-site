// ── MAKE THE FOREGROUND'S BOX ITS PAINTED CONTENT ────────────────────────────────────────────────────────────
// Luke: "you have one layer that's like up too high so that you can see between the two layers into the
// backdrop."
//
// Right: .tw-fg is positioned by its BOX, but the generated art leaves transparent padding below the painted
// wall. So the box sits where CSS says and the wall floats somewhere inside it, leaving a strip of bare sky
// between the wall's base and the top of the ground. No amount of nudging the CSS fixes that reliably,
// because the padding differs per image.
//
// So: crop each foreground to its alpha bounding box, then re-apply the bottom fade. After this the bottom
// edge of the element IS the base of the wall, and `bottom: 33%` means what it says.
//
// ⚠️ TRIM BEFORE FEATHERING, NEVER AFTER. A feathered image has no hard alpha edge to find — the bounding
// box would include the fade and the trim would do nothing. The fade is re-applied to the cropped result.
import fs from "node:fs";
import sharp from "sharp";

const DIR = "public/images/town/ground";
const FADE = 0.18;

for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith("-fg.webp")) continue;
    const src = fs.readFileSync(`${DIR}/${f}`);
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = info;

    // Alpha bounding box, ignoring the near-invisible tail the fade leaves behind.
    let top = H, bot = -1;
    for (let y = 0; y < H; y += 1) {
        let solid = 0;
        for (let x = 0; x < W; x += 1) if (data[(y * W + x) * 4 + 3] > 40) solid += 1;
        if (solid > W * 0.02) { if (y < top) top = y; bot = y; }
    }
    if (bot < 0 || (top === 0 && bot === H - 1)) { console.log(`nothing to trim  ${f}`); continue; }

    const h = bot - top + 1;
    const cropped = await sharp(src).extract({ left: 0, top, width: W, height: h }).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    const d = cropped.data;
    const band = Math.max(1, Math.round(h * FADE));
    for (let y = h - band; y < h; y += 1) {
        const k = (h - 1 - y) / band;
        for (let x = 0; x < W; x += 1) { const i = (y * W + x) * 4; d[i + 3] = Math.round(d[i + 3] * k); }
    }
    fs.writeFileSync(`${DIR}/${f}`, await sharp(d, { raw: { width: W, height: h, channels: 4 } })
        .webp({ quality: 90, alphaQuality: 100 }).toBuffer());
    console.log(`${f.padEnd(22)} ${H} -> ${h}px  (trimmed ${top}px of empty sky above, ${H - 1 - bot}px below)`);
}
