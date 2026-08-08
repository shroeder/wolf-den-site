// ── WHERE THE PARTS OF A SHIP ARE, MEASURED OFF THE ART ──────────────────────────────────────────────────────
// Targeting needs to know which bit of a ship a tap landed on: her sails, her hull, her rudder, her magazine.
// Hand-authoring that for 26 hulls is 26 chances to be wrong and a fresh job every time one is redrawn — so
// nothing here is hand-placed. This reads the actual PNG and works the areas out of the pixels:
//
//   • the DECK LINE (deck-lines.js) already says where the deck sits on each hull, and that one number splits
//     the sprite cleanly: everything opaque above it is canvas and rigging, everything below it is ship.
//   • the STERN is found by thickness. A bow tapers to a cutwater and a stern is a blunt transom, so the hull's
//     end with more timber in it is the back — that is the end the RUDDER hangs off.
//   • the MAGAZINE is the deepest, most central part of the hull, shifted aft the way a real powder store is:
//     small, buried, and the reason a lucky shot ends a fight early.
//
// Output is a GRID, not polygons: one character per cell of a 28×28 lattice over the sprite box. Hit-testing a
// tap is then two divisions and a lookup — no geometry library on a phone — and a zone can be any shape the
// ship happens to be, including the holes between a hull and its own bowsprit.
//
//   node scripts/scan-ship-zones.mjs            write src/lib/marketplace/ship-zones.js
//   node scripts/scan-ship-zones.mjs --sheet    also write a contact sheet to check it by eye
//
// The contact sheet is the point. A grid of numbers cannot be reviewed; a tinted overlay on every hull can, and
// that is how these were signed off.

import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GRID = 28;                 // cells per side. 28 ≈ 3.6% of a hull per cell — a fat thumb covers three.
const OPAQUE = 60;               // alpha above this counts as ship
const COVER = 0.12;              // fraction of a cell that must be ship for the cell to belong to a zone

// The deck lines are DATA that already exists and must not be duplicated — a second copy is a second thing to
// forget when a hull is redrawn. Parsed straight out of the module rather than re-typed.
function deckTables() {
    const src = readFileSync(resolve(ROOT, "src/lib/marketplace/deck-lines.js"), "utf8");
    const grab = (name) => {
        const body = src.split(`export const ${name} = {`)[1].split("};")[0];
        const out = {};
        for (const m of body.matchAll(/([\w:"']+)\s*:\s*(\d+)/g)) out[m[1].replace(/["']/g, "")] = Number(m[2]);
        return out;
    };
    return { fleet: grab("FLEET_DECK"), boat: grab("BOAT_DECK") };
}

const BOAT_ART = {
    1: "boat-tier1-wood", 2: "boat-tier2-cutter", 3: "boat-tier3-brig", 4: "boat-tier4-schooner",
    5: "boat-tier5-galleon", 6: "boat-tier6-manowar", 7: "boat-tier7-arcane", 8: "boat-tier8-dragon",
    9: "boat-tier9-ghost", 10: "boat-tier10-leviathan", 11: "boat-tier11-celestial",
};

// Per-cell aggregates over the whole sprite box. Everything downstream reads these rather than the pixels.
async function cellsOf(file) {
    const img = sharp(file).ensureAlpha();
    const { width, height } = await img.metadata();
    const raw = await img.raw().toBuffer();
    const cw = width / GRID, ch = height / GRID;
    const cover = new Float64Array(GRID * GRID);
    const count = new Float64Array(GRID * GRID);
    let minX = 1, maxX = 0, minY = 1, maxY = 0, any = false;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (raw[(y * width + x) * 4 + 3] < OPAQUE) continue;
            any = true;
            const u = x / width, v = y / height;
            if (u < minX) minX = u; if (u > maxX) maxX = u;
            if (v < minY) minY = v; if (v > maxY) maxY = v;
            const i = Math.min(GRID - 1, Math.floor(y / ch)) * GRID + Math.min(GRID - 1, Math.floor(x / cw));
            cover[i] += 1;
        }
    }
    for (let i = 0; i < cover.length; i += 1) count[i] = cover[i] / (cw * ch);
    return { count, box: any ? { minX, maxX, minY, maxY } : { minX: 0, maxX: 1, minY: 0, maxY: 1 }, width, height };
}

// WHICH END IS THE BACK. A bow tapers, a stern is blunt — so the end carrying more timber below the deck is the
// stern. Measured on the hull band only, because sails and bowsprits sit above it and would drown the signal.
function sternSide(count, box, deckV) {
    const rows = [];
    for (let gy = 0; gy < GRID; gy += 1) if ((gy + 0.5) / GRID > deckV) rows.push(gy);
    const mass = (from, to) => {
        let sum = 0;
        for (const gy of rows) for (let gx = from; gx < to; gx += 1) sum += count[gy * GRID + gx];
        return sum;
    };
    const lo = Math.floor(box.minX * GRID), hi = Math.ceil(box.maxX * GRID);
    const span = Math.max(3, Math.round((hi - lo) * 0.22));
    const left = mass(lo, lo + span), right = mass(hi - span, hi);
    // A tie is possible on a symmetrical hull; left-facing is the fleet's drawn convention, so the stern is the
    // right-hand end unless the timber says otherwise.
    return { side: left > right * 1.06 ? "left" : "right", left: +left.toFixed(1), right: +right.toFixed(1) };
}

function zonesFor(count, box, deckPct) {
    const deckV = 1 - deckPct / 100;                 // deck line as a fraction from the TOP
    const stern = sternSide(count, box, deckV);
    const cell = new Array(GRID * GRID).fill(".");

    // 1. The clean split: canvas above the deck, ship below it.
    for (let gy = 0; gy < GRID; gy += 1) {
        for (let gx = 0; gx < GRID; gx += 1) {
            const i = gy * GRID + gx;
            if (count[i] < COVER) continue;
            cell[i] = (gy + 0.5) / GRID < deckV ? "s" : "h";
        }
    }

    // 2. The hull's own extent, which is what the rudder and the magazine are measured against — NOT the sprite
    //    box, which a bowsprit or a topmast can stretch a long way past the ship.
    let hMinX = GRID, hMaxX = 0, hMinY = GRID, hMaxY = 0, hullCells = 0;
    for (let gy = 0; gy < GRID; gy += 1) for (let gx = 0; gx < GRID; gx += 1) {
        if (cell[gy * GRID + gx] !== "h") continue;
        hullCells += 1;
        if (gx < hMinX) hMinX = gx; if (gx > hMaxX) hMaxX = gx;
        if (gy < hMinY) hMinY = gy; if (gy > hMaxY) hMaxY = gy;
    }
    if (!hullCells) return { rows: cell, stern, hull: 0 };

    // 3. THE RUDDER hangs off the stern, below the waterline — the aft-most timber in the bottom half of the
    //    hull. Kept deliberately small: it is the hardest thing on the ship to hit and that is the whole point
    //    of aiming at it.
    // A THIN HULL STILL NEEDS A RUDDER YOU CAN HIT. The sloop's stern is two cells of timber, and a one-cell
    // target on a phone is a target nobody can tap — the zone would exist in the maths and not in the hands.
    // So the band widens until it owns a few cells, and only then stops.
    const hullW = hMaxX - hMinX + 1, hullH = hMaxY - hMinY + 1;
    const MIN_RUDDER = 5;
    const paintRudder = (widthFrac, deepFrac) => {
        const rudW = Math.max(2, Math.round(hullW * widthFrac));
        const from = stern.side === "right" ? hMaxX - rudW + 1 : hMinX;
        const to = stern.side === "right" ? hMaxX : hMinX + rudW - 1;
        let n = 0;
        for (let gy = hMinY + Math.floor(hullH * deepFrac); gy <= hMaxY; gy += 1) {
            for (let gx = from; gx <= to; gx += 1) {
                const i = gy * GRID + gx;
                if (cell[i] === "h" || cell[i] === "r") { cell[i] = "r"; n += 1; }
            }
        }
        return n;
    };
    let rudderCells = paintRudder(0.13, 0.4);
    for (const [w, d] of [[0.18, 0.3], [0.24, 0.2], [0.3, 0.1]]) {
        if (rudderCells >= MIN_RUDDER) break;
        rudderCells = paintRudder(w, d);
    }

    // 4. THE POWDER STORE. Buried amidships and a little aft, in the bottom of the hold — two cells by two, so
    //    it is a genuine gamble rather than a fifth ordinary target.
    const magX = Math.round(hMinX + hullW * (stern.side === "right" ? 0.58 : 0.34));
    const magY = Math.round(hMinY + hullH * 0.55);
    for (let gy = magY; gy <= Math.min(hMaxY, magY + 1); gy += 1) {
        for (let gx = magX; gx <= Math.min(hMaxX, magX + 1); gx += 1) {
            const i = gy * GRID + gx;
            if (cell[i] === "h" || cell[i] === "r") cell[i] = "p";
        }
    }

    // 5. NOTHING MAY BE UNTARGETABLE. A hull whose deck line swallowed its own rudder, or a sloop drawn so low
    //    that the magazine landed outside the timber, would leave a tap on that zone doing nothing at all —
    //    which reads as a broken button rather than a missing feature. Fall back to the middle of the hull.
    const has = (c) => cell.some((v) => v === c);
    if (!has("p")) { const i = (hMinY + Math.floor(hullH / 2)) * GRID + Math.round((hMinX + hMaxX) / 2); if (cell[i] !== ".") cell[i] = "p"; }
    if (!has("r")) {
        const gx = stern.side === "right" ? hMaxX : hMinX;
        for (let gy = hMaxY; gy >= hMinY; gy -= 1) { const i = gy * GRID + gx; if (cell[i] === "h") { cell[i] = "r"; break; } }
    }
    return { rows: cell, stern, hull: hullCells };
}

const toRows = (cell) => {
    const out = [];
    for (let gy = 0; gy < GRID; gy += 1) out.push(cell.slice(gy * GRID, gy * GRID + GRID).join(""));
    return out;
};

// ── THE CONTACT SHEET ────────────────────────────────────────────────────────────────────────────────────────
// Tinted zones over every hull at once. The numbers cannot be reviewed by reading them; this can.
const TINT = { h: [214, 158, 74], s: [96, 170, 235], r: [104, 214, 132], p: [232, 92, 92] };
async function overlay(file, rows, size = 210) {
    const base = await sharp(file).resize(size, size, { fit: "contain", background: { r: 12, g: 22, b: 38, alpha: 1 } }).toBuffer();
    const px = Buffer.alloc(size * size * 4, 0);
    const step = size / GRID;
    for (let gy = 0; gy < GRID; gy += 1) {
        for (let gx = 0; gx < GRID; gx += 1) {
            const c = rows[gy][gx];
            const t = TINT[c];
            if (!t) continue;
            for (let y = Math.floor(gy * step); y < Math.floor((gy + 1) * step); y += 1) {
                for (let x = Math.floor(gx * step); x < Math.floor((gx + 1) * step); x += 1) {
                    const i = (y * size + x) * 4;
                    px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 105;
                }
            }
        }
    }
    const tint = await sharp(px, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
    return sharp(base).composite([{ input: tint, blend: "over" }]).png().toBuffer();
}

async function main() {
    const sheet = process.argv.includes("--sheet");
    const { fleet, boat } = deckTables();
    const targets = [
        ...Object.keys(fleet).map((art) => ({ key: art, file: `public/images/fleet/${art}.png`, deck: fleet[art] })),
        ...Object.keys(BOAT_ART).map((tier) => ({ key: `boat:${tier}`, file: `public/images/sailing/${BOAT_ART[tier]}.png`, deck: boat[tier] ?? 30 })),
    ];

    const out = {};
    const tiles = [];
    for (const t of targets) {
        const { count, box } = await cellsOf(resolve(ROOT, t.file));
        const { rows: cell, stern, hull } = zonesFor(count, box, t.deck);
        const rows = toRows(cell);
        const tally = { s: 0, h: 0, r: 0, p: 0 };
        for (const c of cell) if (tally[c] != null) tally[c] += 1;
        out[t.key] = { facing: stern.side === "right" ? "left" : "right", rows };
        console.log(`${t.key.padEnd(22)} deck ${String(t.deck).padStart(2)}  stern ${stern.side.padEnd(5)} ` +
            `(${stern.left} vs ${stern.right})  hull ${String(hull).padStart(3)}  sails ${String(tally.s).padStart(3)}  rudder ${tally.r}  mag ${tally.p}`);
        if (sheet) tiles.push({ key: t.key, buf: await overlay(resolve(ROOT, t.file), rows) });
    }

    const body = Object.entries(out).map(([k, v]) =>
        `    ${/[^\w]/.test(k) ? JSON.stringify(k) : k}: { facing: ${JSON.stringify(v.facing)}, rows: [\n` +
        v.rows.map((r) => `        ${JSON.stringify(r)},`).join("\n") + "\n    ] },").join("\n");

    const file = `// GENERATED by scripts/scan-ship-zones.mjs — do not hand-edit. Re-run it when a hull is redrawn.
//
// One 28×28 grid per hull, measured off the sprite's own pixels: "." nothing, "s" sails and rigging, "h" hull,
// "r" rudder, "p" powder store. \`facing\` is the way the art is drawn, which is what tells the scene whether a
// mirrored hull needs its grid mirrored with it.
//
// See ship-zones.js for how a tap becomes a zone, and scan-ship-zones.mjs for how these were worked out.
export const ZONE_GRID = ${GRID};
export const SHIP_ZONE_MAPS = {
${body}
};
`;
    writeFileSync(resolve(ROOT, "src/lib/marketplace/ship-zone-maps.js"), file);
    console.log(`\nwrote src/lib/marketplace/ship-zone-maps.js (${targets.length} hulls)`);

    if (tiles.length) {
        const cols = 6, size = 210, pad = 6;
        const rows = Math.ceil(tiles.length / cols);
        const W = cols * (size + pad) + pad, H = rows * (size + pad) + pad;
        const canvas = sharp({ create: { width: W, height: H, channels: 4, background: { r: 8, g: 14, b: 24, alpha: 1 } } });
        const comp = tiles.map((t, i) => ({
            input: t.buf,
            left: pad + (i % cols) * (size + pad),
            top: pad + Math.floor(i / cols) * (size + pad),
        }));
        await canvas.composite(comp).png().toFile(resolve(ROOT, "scratch-zones.png"));
        console.log("wrote scratch-zones.png");
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
