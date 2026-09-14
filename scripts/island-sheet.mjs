// ── LOOK AT THE ARCHIPELAGO ──────────────────────────────────────────────────────────────────────────────────
// A file listing is not evidence. Four contact sheets — wardens, props, prizes, backdrops — because the two
// failures that matter are invisible in a directory and obvious in one glance side by side:
//
//   CLIPPING    a sprite running off its own frame. Caught by seeing it next to thirty that do not.
//   AMPUTATION  a whole creature drawn missing a limb, or a ship with no stern. Looks fine alone.
//   FACING      a foe pointing right when every other one points left. This is the one that bit first.
//
// See [[sprite-amputation-vs-clipping]] and [[watch-it-run-before-done]].
//
//   node scripts/island-sheet.mjs
import fs from "node:fs";
import sharp from "sharp";
import { ISLANDS } from "../src/lib/marketplace/islands.js";
import { ESCORTS, WARDENS } from "../src/lib/marketplace/island-wardens.js";

const IN = "public/images/islands";
const OUT = "scratch";
fs.mkdirSync(OUT, { recursive: true });

// A checkerboard behind every die-cut sprite. A white sticker rim is invisible on white and glaring on this,
// and so is a sprite that quietly came back with a background baked into it.
async function checker(w, h, cell = 16) {
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id="c" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">
            <rect width="${cell * 2}" height="${cell * 2}" fill="#3a4250"/>
            <rect width="${cell}" height="${cell}" fill="#2b313c"/>
            <rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#2b313c"/>
        </pattern></defs><rect width="${w}" height="${h}" fill="url(#c)"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

function label(text, w, h) {
    const safe = String(text).replace(/[&<>]/g, "");
    return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <text x="6" y="${h - 6}" font-family="sans-serif" font-size="13" fill="#ffe9b0">${safe}</text></svg>`);
}

async function sheet(name, items, { tile = 200, cols = 6, pad = 26, bg = true } = {}) {
    const have = items.filter((i) => fs.existsSync(i.file));
    if (!have.length) { console.log(`  ${name}: nothing drawn yet`); return; }
    const rows = Math.ceil(have.length / cols);
    const W = cols * tile, H = rows * (tile + pad);
    const base = bg ? await checker(W, H) : await sharp({ create: { width: W, height: H, channels: 4, background: "#12161c" } }).png().toBuffer();

    const layers = [];
    for (let n = 0; n < have.length; n += 1) {
        const x = (n % cols) * tile, y = Math.floor(n / cols) * (tile + pad);
        const buf = await sharp(have[n].file).resize(tile - 8, tile - 8, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        layers.push({ input: buf, left: x + 4, top: y + 4 });
        layers.push({ input: label(have[n].name, tile, pad), left: x, top: y + tile });
    }
    const out = `${OUT}/islands-${name}.png`;
    await sharp(base).composite(layers).png().toFile(out);
    console.log(`  ${name}: ${have.length}/${items.length} drawn  →  ${out}`);
}

const wardens = [
    ...Object.entries(ESCORTS).flatMap(([b, pool]) => pool.map((r) => ({ name: `${b}: ${r.name}`, file: `${IN}/warden/${r.id}.png` }))),
    ...ISLANDS.filter((i) => WARDENS[i.id]).map((i) => ({ name: `${i.rung}. ${WARDENS[i.id].name}`, file: `${IN}/warden/wd_${i.id}.png` })),
];
const props = Object.keys(ESCORTS).flatMap((b) => ["wreck", "cache", "forage", "shrine", "warden"].map((k) => ({ name: `${b}-${k}`, file: `${IN}/props/${b}-${k}.png` })));
const prizes = ISLANDS.map((i) => ({ name: i.name, file: `${IN}/prize/${i.id}.png` }));
const backs = ISLANDS.map((i) => ({ name: `${i.rung}. ${i.name}`, file: `${IN}/${i.id}.webp` }));

console.log("\ncontact sheets:");
await sheet("wardens", wardens, { tile: 190, cols: 8 });
await sheet("props", props, { tile: 190, cols: 5 });
await sheet("prizes", prizes, { tile: 170, cols: 7 });
await sheet("backdrops", backs, { tile: 300, cols: 5, bg: false });
console.log("");
