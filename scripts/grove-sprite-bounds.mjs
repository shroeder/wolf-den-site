// ── WHERE A CREATURE ACTUALLY IS INSIDE ITS OWN SPRITE ───────────────────────────────────────────────────────
//
//   node scripts/grove-sprite-bounds.mjs
//
// Not a gate (see gates-dont-make-them) — a tool, and the one that produced the `foot` column in GROVE_SIZE.
//
// ⚠️ THE REASON IT HAD TO EXIST. The Grove's bodies hovered above the floor and the obvious diagnosis was
// wrong: the working theory was object-fit: contain centring a LANDSCAPE sprite in a square box and leaving
// the slack under its feet. Measured, these sprites are square — the rootrat's drawn pixels are 416x385 in a
// 448x448 plate — so contain leaves almost no slack at all and object-position would have fixed nothing.
//
// What is actually there is a few percent of transparent air painted UNDER the feet, which differs per sprite
// because they were drawn by different passes for different features. You cannot read that off a file name,
// and you cannot see it in a viewer either, because transparent padding looks exactly like nothing.
//
// So: measure the alpha bounding box, print it as a share of the plate, and author the numbers. Re-run it
// after any art pass that touches a creature; see sprite-alpha-floor-drop-shadow-box for why "transparent"
// does not always mean alpha 0 (the threshold below is deliberately 12, not 0).
import fs from "node:fs";

import sharp from "sharp";

import { GROVE_ENEMIES, GROVE_RARE, GROVE_BOSSES, GROVE_SIZE, BOSS_SIZE } from "../src/lib/marketplace/grove-catalog.js";

const ALPHA_FLOOR = 12;

const rows = [
    ...Object.values(GROVE_ENEMIES).map((e) => ({ id: e.id, art: e.art, boss: false })),
    { id: GROVE_RARE.id, art: GROVE_RARE.art, boss: false },
    ...Object.values(GROVE_BOSSES).map((b) => ({ id: b.id, art: b.art, boss: true })),
];

const out = [];
for (const row of rows) {
    const file = row.art ? `public${row.art}` : null;
    if (!file || !fs.existsSync(file)) { out.push({ ...row, missing: true }); continue; }
    const img = sharp(file).ensureAlpha();
    const meta = await img.metadata();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            if (data[(y * info.width + x) * info.channels + 3] > ALPHA_FLOOR) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
    }
    out.push({
        ...row,
        plate: `${meta.width}x${meta.height}`,
        drawn: `${x1 - x0 + 1}x${y1 - y0 + 1}`,
        ar: (x1 - x0 + 1) / (y1 - y0 + 1),
        // The share of the plate that is empty under the feet — what `foot` in GROVE_SIZE has to cancel.
        foot: (info.height - 1 - y1) / info.height,
        head: y0 / info.height,
    });
}

console.log("\n  id                    plate       drawn        AR     foot   authored   head");
console.log("  " + "-".repeat(84));
for (const r of out) {
    if (r.missing) { console.log(`  ${r.id.padEnd(21)} NO SPRITE ON DISK (${r.art || "art: null"})`); continue; }
    const authored = (r.boss ? BOSS_SIZE[r.id] : GROVE_SIZE[r.id])?.foot ?? null;
    const drift = authored == null ? "  —" : Math.abs(authored - r.foot) > 0.025 ? " ⚠️" : "  ok";
    console.log(`  ${r.id.padEnd(21)} ${r.plate.padEnd(11)} ${r.drawn.padEnd(12)} ${r.ar.toFixed(2)}   ${r.foot.toFixed(3)}  ${String(authored).padEnd(6)}${drift}   ${r.head.toFixed(3)}`);
}
console.log(`
  foot      measured transparent air under the feet, as a share of the plate's height
  authored  what GROVE_SIZE says, which is what the scene actually nudges by
  ⚠️        the two disagree by more than 2.5% of the body — re-author it
`);
