// ── WHICH SPRITES ARE CUT OFF BY THEIR OWN CANVAS EDGE ───────────────────────────────────────────────────────
//
//   node scripts/grove-sprite-amputation.mjs            # the list
//   node scripts/grove-sprite-amputation.mjs --sheets   # ...and contact sheets of every candidate's crown
//
// Luke, looking at a boss fight: "The harvest man had a cut off head can u fix along with any other similar
// issues." He was right, and it was a family: the Harvestman's straw head is sliced flat across the top row
// of its plate, and the Heartwood Elder, the Elderling and Oldtimber all lose their antlers the same way.
//
// ⚠️ TOUCHING THE TOP EDGE IS NOT THE DEFECT — FILLING IT IS. A sprite that fills its plate is what we WANT:
// canvas fill is on-stage scale, and a creature drawn small inside a big transparent plate renders small. So
// a rounded crown whose highest pixel grazes the top row is correct and 81 of 160 sprites do it. What marks
// an amputation is a long CONTIGUOUS RUN of opaque pixels along that row — a flat slice where a silhouette
// should be curving away. Antlers and horns are the usual victims, which is why a forest bestiary has so many.
//
// ⚠️ AND THE NUMBER ONLY NOMINATES. A pillar-shaped creature has a flat top honestly. Judge the sheets.
// See sprite-amputation-vs-clipping: generate PORTRAIT, deliver SQUARE.
import fs from "node:fs";

import sharp from "sharp";

const DIR = "public/images/grove";
const ALPHA_FLOOR = 10;      // "transparent" comes back 1-2 — see sprite-alpha-floor-drop-shadow-box
const RUN = 40;              // ~4% of a 1024 plate. Below this a crown is grazing the edge, not sliced.
const SHEETS = process.argv.includes("--sheets");
const OUT = process.env.OUT || ".";

const files = fs.readdirSync(DIR).filter((f) => /^(boss|foe)-.*\.webp$/.test(f)).sort();
const hits = [];
for (const f of files) {
    const { data, info } = await sharp(`${DIR}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    let run = 0, best = 0, n = 0;
    for (let x = 0; x < w; x += 1) {
        if (data[x * 4 + 3] > ALPHA_FLOOR) { run += 1; best = Math.max(best, run); n += 1; } else run = 0;
    }
    if (best >= RUN) hits.push({ f, w, h, run: best, pct: Math.round(100 * n / w) });
}
hits.sort((a, b) => b.run - a.run);
for (const r of hits) console.log(`${r.f.replace(/\.webp$/, "").padEnd(30)} run ${String(r.run).padStart(4)}px  ${String(r.pct).padStart(3)}% of the top row`);
console.log(`\n${hits.length} of ${files.length} sprites have a flat run of ${RUN}px or more along their top edge.`);

if (!SHEETS) { console.log("\n--sheets to draw the crowns"); process.exit(0); }

// The top 30% of each, four to a row, named. Nothing is decided from the number alone.
const CW = 300, CH = 120, COLS = 4, PER = 12;
for (let s = 0; s * PER < hits.length; s += 1) {
    const page = hits.slice(s * PER, s * PER + PER);
    const tiles = [];
    for (let i = 0; i < page.length; i += 1) {
        const r = page[i];
        const strip = await sharp(`${DIR}/${r.f}`)
            .extract({ left: 0, top: 0, width: r.w, height: Math.round(r.h * 0.3) })
            .flatten({ background: "#2a2030" }).resize(CW, CH, { fit: "fill" }).png().toBuffer();
        const name = r.f.replace(/\.webp$/, "");
        const label = Buffer.from(`<svg width="${CW}" height="20"><rect width="${CW}" height="20" fill="#000a"/>`
            + `<text x="5" y="14" font-family="monospace" font-size="12" fill="#ffd75e">${name} (${r.run}px)</text></svg>`);
        tiles.push({ input: strip, left: (i % COLS) * CW, top: Math.floor(i / COLS) * (CH + 20) });
        tiles.push({ input: label, left: (i % COLS) * CW, top: Math.floor(i / COLS) * (CH + 20) + CH });
    }
    const rows = Math.ceil(page.length / COLS);
    const out = `${OUT}/amputation-${s + 1}.png`;
    await sharp({ create: { width: CW * COLS, height: rows * (CH + 20), channels: 3, background: "#111" } })
        .composite(tiles).png().toFile(out);
    console.log("wrote", out);
}
