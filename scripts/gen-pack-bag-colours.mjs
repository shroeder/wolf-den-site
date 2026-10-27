// ── ONE BAG, FOUR COLOURS, THE SAME LOGO ─────────────────────────────────────────────────────────────────────
// Luke, 2026-10-27: "Lets have each bag differ in color but retain the same logo sprite."
//
// ── ⚠️ WHY THIS IS PIXELS AND NOT A GENERATOR ────────────────────────────────────────────────────────────────
// "Retain the same logo sprite" is a constraint a drawing model cannot honour. Ask it for the same bag in
// green and it redraws the crest — slightly different crescent, slightly different wolf — and four packs on a
// carousel with four almost-identical logos is worse than one logo repeated, because the eye reads the
// difference as a mistake rather than as a brand. Recolouring the bytes we already have keeps the logo
// IDENTICAL by construction, costs nothing, and is repeatable.
//
// ── ⚠️ AND WHY NOT A CSS FILTER ──────────────────────────────────────────────────────────────────────────────
// hue-rotate() is the obvious answer and it is exactly backwards here. The bag body is near-black — almost no
// saturation, so rotating its hue does nothing visible — while the crest is the most saturated thing in the
// frame, so the filter would recolour the one element that must not move and leave the one that must.
//
// ── HOW ─────────────────────────────────────────────────────────────────────────────────────────────────────
// A duotone over the bag only. Every pixel is classified by saturation and hue:
//
//   · GOLD (the crest)            -> untouched, byte for byte
//   · everything else (the foil)  -> remapped onto a shadow→highlight ramp, keeping its own luminance
//
// Keeping luminance is what preserves the creases, the zip and the sheen — the bag still looks like the same
// photographed object, lit the same way, in a different colour of foil.
//
//   node scripts/gen-pack-bag-colours.mjs          write them
//   node scripts/gen-pack-bag-colours.mjs --sheet  …and a contact sheet to look at first
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "public", "images", "packs", "mystery-bag-drawn-600.webp");
const OUT = path.join(process.cwd(), "public", "images", "packs");
const SHEET = process.argv.includes("--sheet");

// Shadow and highlight for each pool's foil. All of them stay DARK and jewel-toned: the crest is gold, and
// gold only reads as gold against something that is not competing with it. A bright bag would turn the logo
// into a sticker.
//
// ⚠️ `bags` IS NOT IN HERE. The house bag is the original file and is not regenerated — it is the one every
// member already knows, and repainting shipped art to match a naming scheme is how a brand gets quietly
// replaced. The others are recoloured copies OF it.
const POOLS = [
    { key: "pkmn", shadow: [14, 6, 10], highlight: [168, 38, 52] },    // crimson — Pokémon's own red, dulled
    { key: "mtg", shadow: [6, 13, 11], highlight: [36, 132, 96] },     // deep green
    { key: "ygo", shadow: [12, 8, 20], highlight: [104, 66, 180] },    // violet
];

/** Is this the crest? Gold is the only strongly saturated warm thing in the frame; the foil is grey. */
function isGold(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    // Yellow-ish: red leads, green follows, blue trails well behind. The threshold is deliberately loose at
    // the edges of the crest, where antialiasing blends gold into the foil — a hard cut there leaves a dirty
    // outline around the wolf.
    return sat > 42 && r >= g && g > b && r - b > 50;
}

async function recolour(src, { shadow, highlight }) {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.from(data);
    for (let i = 0; i < out.length; i += 4) {
        const r = out[i];
        const g = out[i + 1];
        const b = out[i + 2];
        if (out[i + 3] === 0) continue;          // fully transparent — nothing to colour
        if (isGold(r, g, b)) continue;           // the crest, untouched

        // Rec. 601 luma, which is what the eye reads as "how light is this" and therefore what has to
        // survive the recolour for the creases to stay creases.
        const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        out[i] = Math.round(shadow[0] + (highlight[0] - shadow[0]) * t);
        out[i + 1] = Math.round(shadow[1] + (highlight[1] - shadow[1]) * t);
        out[i + 2] = Math.round(shadow[2] + (highlight[2] - shadow[2]) * t);
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function main() {
    if (!fs.existsSync(SRC)) throw new Error(`no source bag at ${SRC}`);
    const made = [];
    for (const pool of POOLS) {
        const dest = path.join(OUT, `mystery-bag-${pool.key}-600.webp`);
        // ⚠️ LOSSLESS, AND THAT IS THE WHOLE CONSTRAINT RATHER THAN A QUALITY PREFERENCE. At quality 92 the
        //    encoder re-approximated the crest as well — pixels this script never touched came out
        //    different, and only 10,059 of 35,096 gold pixels survived byte-for-byte. Invisible, and still
        //    the wrong answer: "the same logo sprite" is a guarantee or it is a hope. Lossless makes the
        //    untouched pixels provably untouched, and these are 600px bags.
        //    It costs about 67kb a bag over the lossy original (147kb against 80kb). Near-lossless would
        //    claw back 25kb of that and alter the crest again, which is the one thing being bought here —
        //    and these three are owner-gated assets that today only Luke's browser ever fetches.
        await (await recolour(SRC, pool)).webp({ lossless: true, effort: 6 }).toFile(dest);
        made.push(dest);
        console.log(`  ${pool.key} -> ${path.basename(dest)}`);
    }

    if (SHEET) {
        const files = [SRC, ...made];
        const w = 300;
        const tiles = await Promise.all(files.map((f) => sharp(f)
            .resize(w, null, { fit: "contain", background: { r: 12, g: 12, b: 14, alpha: 1 } })
            .flatten({ background: { r: 12, g: 12, b: 14 } }).png().toBuffer()));
        const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
        const h = Math.max(...metas.map((m) => m.height));
        await sharp({ create: { width: w * tiles.length, height: h, channels: 3, background: { r: 12, g: 12, b: 14 } } })
            .composite(tiles.map((input, i) => ({ input, left: i * w, top: 0 })))
            .png().toFile(path.join(process.cwd(), ".pack-art", "bag-colours.png"));
        console.log("sheet -> .pack-art/bag-colours.png");
    }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
