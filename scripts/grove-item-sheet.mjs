// ── IS A DROP STILL LEGIBLE AT THE SIZE IT IS ACTUALLY DRAWN? ────────────────────────────────────────────────
// A contact sheet of 256px item sprites is a sheet of pictures nobody will ever see. In the zone a drop is
// about 3 units against a 7-unit hero, which on a 390px-wide phone is roughly 30 PIXELS. Every one of these
// has to be identifiable at that size or the sprite is decoration and the player is still reading the label.
//
// So each row shows the same sprite three times: large enough to judge the draw, at 48px, and at 30px — the
// real one. See harness-must-reproduce-the-bug.
//
//   node scripts/grove-item-sheet.mjs out/grove-items.png            # everything drawn so far
//   node scripts/grove-item-sheet.mjs out/grove-items.png part-      # one family
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const OUT = process.argv[2] || "out/grove-items.png";
const PREFIX = process.argv[3] || "";
const DIR = "public/images/grove";

const files = fs.readdirSync(DIR)
    .filter((f) => /^(part|emblem|food)-/.test(f) && f.endsWith(".webp") && f.startsWith(PREFIX))
    .sort();
if (!files.length) { console.log("no item sprites drawn yet"); process.exit(0); }

// Three sizes per sprite, over a dark plate — the zones are dark, and a sprite judged on white is a sprite
// judged against the one background it will never be seen on.
const BIG = 128, MID = 48, SMALL = 30;
const COLS = 4;
const CELL_W = BIG + MID + SMALL + 56;
const CELL_H = BIG + 26;
const rows = Math.ceil(files.length / COLS);

const tiles = [];
for (let i = 0; i < files.length; i += 1) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x0 = col * CELL_W + 10;
    const y0 = row * CELL_H + 8;
    const src = path.join(DIR, files[i]);
    let x = x0;
    for (const s of [BIG, MID, SMALL]) {
        const buf = await sharp(src)
            .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png().toBuffer();
        // Bottom-aligned, the way a drop sits on the ground line.
        tiles.push({ input: buf, left: x, top: y0 + (BIG - s) });
        x += s + 14;
    }
    const label = files[i].replace(".webp", "");
    tiles.push({
        input: Buffer.from(`<svg width="${CELL_W - 20}" height="18"><text x="0" y="13" font-family="monospace" font-size="12" fill="#cfd6dd">${label}</text></svg>`),
        left: x0, top: y0 + BIG + 4,
    });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp({ create: { width: COLS * CELL_W, height: rows * CELL_H + 8, channels: 4, background: { r: 22, g: 28, b: 20, alpha: 1 } } })
    .composite(tiles).png().toFile(OUT);
console.log(`${OUT}  ${files.length} sprite(s) at ${BIG}/${MID}/${SMALL}px`);
