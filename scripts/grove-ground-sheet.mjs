// ── WHERE THE HERO'S FEET ACTUALLY LAND ON EACH PLATE ───────────────────────────────────────────────────────
// Luke: "Audit each level and gear the grounding level right. Its either high or low on many. Test each
// visually and improve and iterate until all levels are good."
//
// ⚠️ DO NOT TRY TO FIND THE HORIZON. Two tools have now tried (measure-ground-line.mjs, and the
// difference-based one in grove-ground-audit.mjs) and both are wrong on most plates, because these are
// painterly backdrops where "the flat band at the bottom" is not a thing an edge detector can see: a dark
// cave is quiet all the way up, a textured floor is noisy all the way down, and a dock or a colonnade has
// three candidate lines. The honest version of this job is to draw where the game CURRENTLY stands a body
// and judge it by eye, which is also exactly what Luke asked for.
//
// So this draws, on every plate, at the real geometry:
//   · a RED line at the current ground, GROUND_OF_PLATE of the plate height up from the bottom
//   · a WHITE box the hero's real height standing on it, HERO_UNITS / PLATE_UNITS of the plate
// and takes a per-zone override from ground-overrides.json, so a correction made by eye is drawn back on
// the next run and can be checked. Iterate until every plate reads right.
//
//   node scripts/grove-ground-sheet.mjs            sheets at the current numbers
import { readdirSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const DIR = "public/images/grove";
const OUT = ".promo/ground";

// Read the live geometry rather than retyping it, so the sheet cannot drift from the game.
const view = readFileSync("src/lib/marketplace/grove-view.js", "utf8");
const num = (k) => Number(view.match(new RegExp(`export const ${k}\\s*=\\s*([0-9.]+)`))?.[1]);
const GROUND_OF_PLATE = num("GROUND_OF_PLATE");
const BAND_UNITS = num("GROUND_BAND_UNITS");
// PLATE_UNITS is derived in grove-view now, so derive it here the same way rather than parsing it.
const PLATE_UNITS = BAND_UNITS / GROUND_OF_PLATE;
const HERO_UNITS = num("HERO_UNITS");
if (!GROUND_OF_PLATE || !PLATE_UNITS || !HERO_UNITS) {
    throw new Error(`could not read geometry: ground=${GROUND_OF_PLATE} plate=${PLATE_UNITS} hero=${HERO_UNITS}`);
}
const HERO_FRAC = HERO_UNITS / PLATE_UNITS;      // hero height as a share of the plate
console.log(`GROUND_OF_PLATE ${GROUND_OF_PLATE}   PLATE_UNITS ${PLATE_UNITS}   HERO_UNITS ${HERO_UNITS}`);
console.log(`hero is ${(100 * HERO_FRAC).toFixed(1)}% of the plate; the ground band is ${(100 * GROUND_OF_PLATE).toFixed(1)}%`);
console.log(`hero / ground band = ${(HERO_FRAC / GROUND_OF_PLATE).toFixed(2)}x  (check-grove wants >= 1.15)\n`);

const OVER = existsSync("scripts/data/ground-overrides.json")
    ? JSON.parse(readFileSync("scripts/data/ground-overrides.json", "utf8")) : {};
const DEFAULT_G = Number(OVER._default ?? GROUND_OF_PLATE);
const groundFor = (id) => Number(OVER[id] ?? DEFAULT_G);

const files = readdirSync(DIR).filter((f) => /^zone-.*\.webp$/.test(f)).sort();
mkdirSync(OUT, { recursive: true });

const CW = 300, PER_ROW = 4, ROWS = 4, PER = PER_ROW * ROWS;
let page = 0;
for (let i = 0; i < files.length; i += PER) {
    const slice = files.slice(i, i + PER);
    const tiles = [];
    for (const f of slice) {
        const id = f.replace(/^zone-|\.webp$/g, "");
        const meta = await sharp(`${DIR}/${f}`).metadata();
        const ch = Math.round((meta.height / meta.width) * CW);
        const g = groundFor(id);
        const lineY = Math.round(ch * (1 - g));
        const heroH = Math.round(ch * HERO_FRAC);
        const heroW = Math.round(heroH * 0.42);
        const base = await sharp(`${DIR}/${f}`).resize(CW, ch).toBuffer();
        const svg = Buffer.from(
            `<svg width="${CW}" height="${ch}">`
            // The hero, standing ON the line, so "floating" and "sunk" are both obvious.
            + `<rect x="${Math.round(CW * 0.5 - heroW / 2)}" y="${lineY - heroH}" width="${heroW}" height="${heroH}"`
            + ` fill="rgba(255,255,255,0.30)" stroke="#ffffff" stroke-width="2"/>`
            + `<line x1="0" y1="${lineY}" x2="${CW}" y2="${lineY}" stroke="#ff2d55" stroke-width="3"/>`
            + `<rect x="0" y="0" width="${CW}" height="20" fill="rgba(0,0,0,0.7)"/>`
            + `<text x="5" y="15" font-family="monospace" font-size="13" fill="#fff">`
            + `${id} ${g.toFixed(3)}${OVER[id] != null ? "*" : ""}</text>`
            + `</svg>`,
        );
        tiles.push({ buf: await sharp(base).composite([{ input: svg, top: 0, left: 0 }]).toBuffer(), ch });
    }
    const rowH = Math.max(...tiles.map((t) => t.ch));
    const out = `${OUT}/feet-${++page}.png`;
    await sharp({ create: { width: CW * PER_ROW, height: rowH * Math.ceil(tiles.length / PER_ROW), channels: 3, background: "#101410" } })
        .composite(tiles.map((t, k) => ({ input: t.buf, left: (k % PER_ROW) * CW, top: Math.floor(k / PER_ROW) * rowH })))
        .png().toFile(out);
    console.log(`sheet ${out}  (${slice.length} plates)`);
}
