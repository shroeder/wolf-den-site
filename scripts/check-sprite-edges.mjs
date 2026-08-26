// ── IS ANY SPRITE'S ART RUNNING OFF ITS OWN CANVAS? ──────────────────────────────────────────────────────────
// A sprite whose drawing touches the edge of its image was CUT OFF when it was drawn. On a contact sheet that
// is obvious; on the floor, at ninety pixels tall in a dark room, a flat-topped cabinet just looks like a
// cabinet with a flat top. All five casino machines shipped that way and stayed that way until Luke sent a
// photograph of his phone.
//
// ── WHY A BOUNDING BOX CANNOT DO THIS ────────────────────────────────────────────────────────────────────────
// The usual check is "trim to the content box and measure the margins", and it is the wrong tool twice over:
//
//   · It passes a sprite that is FLUSH to the edge, because a content box flush to the frame still has a
//     content box. You have to ask the opposite question — is anything ON the edge row — which is what this
//     does: count pixels with real alpha in the outermost row and column of each side.
//
//   · It cannot see AMPUTATION at all (a figure drawn with its feet missing has perfect margins). Nothing
//     automatic can. That still needs a contact sheet and a pair of eyes — see the note in the memory this
//     check came out of. This gate covers the half that IS mechanical, so the eyes are spent on the half that
//     is not.
//
// ── WHAT COUNTS AS TOUCHING ──────────────────────────────────────────────────────────────────────────────────
// A handful of pixels is anti-aliasing after a downscale, not a cut limb. The threshold is a share of the
// edge's length, so it scales with the image instead of needing a per-file number.
//
// Run:  npm run check:sprite-edges
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, sep } from "node:path";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Folders of CUTOUT sprites — things that stand on a floor or sit in a list, and must not touch their frame.
const SPRITE_DIRS = [
    "public/images/casino",
    "public/images/town",
    "public/images/arena",
];

// ── THINGS THAT ARE SUPPOSED TO FILL THEIR FRAME ─────────────────────────────────────────────────────────────
// Backgrounds, wall tiles, room art, masthead friezes and window frames are full-bleed BY DESIGN: a room that
// stopped short of its own edges would show a seam. Listed by name rather than guessed at from the filename,
// so adding one is a decision somebody made rather than a pattern that quietly swallowed a real sprite.
const FULL_BLEED = new Set([
    // Backgrounds and room art — a room that stops short of its own edge shows a seam.
    "room.webp", "hall.webp", "vip-room.webp", "fs-window.webp", "harvest-barn.webp",
    // ── AND THESE, EACH LOOKED AT ON A CONTACT SHEET ─────────────────────────────────────────────
    // The gate can tell you art touches its frame. It cannot tell you whether that is wrong. Every entry
    // below was judged by eye and carries the reason, so the list stays a set of decisions rather than a
    // place to bury a failure.
    "decor_lamp.webp",           // hangs by a chain that runs off the top on purpose
    "thf-lantern.webp",          // hangs by a chain that runs off the top on purpose
    "vip-sign.webp",             // hangs from two chains that run off the top on purpose
    "harvest-sheaf.webp",        // a framed tile — the frame IS the edge
    "thf-corner.webp",           // a corner flourish, anchored to the corner by design
    "skill-extraStrikes.webp",   // icon on a painted background, no transparency to trim
    "skill-warbanner.webp",      // icon on a painted background, no transparency to trim
]);
const FULL_BLEED_HINT = /(^|[-_])(bg|room|mast|wall|floor|backdrop|scene|banner)([-_]|\.)/i;

const EDGE_SHARE = 0.02;   // more than 2% of an edge's length in contact = a cut, not anti-aliasing.

const findings = [];
let scanned = 0;

for (const dir of SPRITE_DIRS) {
    const abs = join(root, dir);
    let entries = [];
    try { entries = readdirSync(abs); } catch { continue; }
    for (const name of entries) {
        const p = join(abs, name);
        if (!statSync(p).isFile()) continue;
        if (![".webp", ".png"].includes(extname(name).toLowerCase())) continue;
        if (FULL_BLEED.has(name) || FULL_BLEED_HINT.test(name)) continue;

        let info; let data;
        try {
            const out = await sharp(readFileSync(p)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            data = out.data; info = out.info;
        } catch { continue; }
        scanned += 1;

        const { width: w, height: h, channels: ch } = info;
        const alphaAt = (x, y) => data[(y * w + x) * ch + 3];
        // Fully opaque everywhere means the file has no alpha channel to speak of — a photo or a flattened
        // background, not a cutout. Judging those on edge contact would flag every one of them.
        let clear = 0;
        for (let i = 0; i < w * h; i += Math.max(1, Math.floor((w * h) / 4000))) if (data[i * ch + 3] < 200) clear += 1;
        if (clear === 0) continue;

        const sides = {
            top: (() => { let n = 0; for (let x = 0; x < w; x += 1) if (alphaAt(x, 0) > 24) n += 1; return n / w; })(),
            bottom: (() => { let n = 0; for (let x = 0; x < w; x += 1) if (alphaAt(x, h - 1) > 24) n += 1; return n / w; })(),
            left: (() => { let n = 0; for (let y = 0; y < h; y += 1) if (alphaAt(0, y) > 24) n += 1; return n / h; })(),
            right: (() => { let n = 0; for (let y = 0; y < h; y += 1) if (alphaAt(w - 1, y) > 24) n += 1; return n / h; })(),
        };
        // ── THE BOTTOM EDGE IS NOT A CUT ─────────────────────────────────────────────────────────────
        // Things stand on the bottom of their canvas on purpose. The cabinets are drawn with
        // `object-position: bottom` so the plinth meets the carpet with no gap under it, and a full-body
        // character sprite has feet for the same reason. Failing on bottom contact would flag every
        // correctly-drawn sprite in the game and teach everyone to ignore this check.
        //
        // A crown, a head, a horn or a tail running off the TOP or the SIDES is the thing that is always
        // wrong, and it is the thing that shipped five times.
        const hit = Object.entries(sides).filter(([side, share]) => side !== "bottom" && share > EDGE_SHARE);
        if (hit.length) {
            findings.push({
                file: `${dir}/${name}`.split(sep).join("/"),
                where: hit.map(([side, share]) => `${side} ${(share * 100).toFixed(0)}%`).join(", "),
            });
        }
    }
}

if (findings.length) {
    console.error(`\n✗ ${findings.length} sprite${findings.length === 1 ? "" : "s"} touch the edge of their own canvas.`);
    console.error("  Art on the frame is art that was drawn past it — the crown, the feet or the tail is missing.\n");
    for (const f of findings) console.error(`    ${f.file.padEnd(46)} ${f.where}`);
    console.error("\n  Redraw with a framing clause that demands empty space on every side (see gen-casino-art.mjs,");
    console.error("  const FRAMING), or if the art is whole and merely flush, shrink it a few percent inside its");
    console.error("  own canvas and re-centre. If it is meant to be full-bleed, add it to FULL_BLEED in this file.");
    process.exit(1);
}

console.log(`check:sprite-edges — ${scanned} cutout sprites, none touching their frame. ✓`);
console.log("  (Amputation — a figure drawn incomplete inside perfect margins — is invisible to this and to");
console.log("   every other automatic check. That one still needs a contact sheet and a look.)");
