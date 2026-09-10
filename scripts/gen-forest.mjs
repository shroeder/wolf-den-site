// ── THE FOREST'S ART ─────────────────────────────────────────────────────────────────────────────────
// A dark backdrop, one sprite per tree kind, one per axe form, and a stump for a felled patch.
//
// ⚠️ THE TREE PROMPTS COME OUT OF forest.js. Same rule as the card pets: the tree is already defined there
// with its name and rarity, so a second copy of its description here is a second thing to forget when one
// is redrawn. Read as text because forest.js is fine but its neighbours use the "@/" alias.
//
//   node scripts/gen-forest.mjs            only what is missing
//   node scripts/gen-forest.mjs --force    redraw everything
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt, HOUSE_STYLE, NEGATIVE_STYLE } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("../accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");
const OUT = "public/images/forest";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/trees`, { recursive: true });
fs.mkdirSync(`${OUT}/axes`, { recursive: true });
const FORCE = process.argv.includes("--force");
// ⚠️ slice(2) — argv[0] is the node binary and argv[1] is this script, so an unsliced filter is
// never empty and the "only what was asked for" branch quietly skips EVERYTHING.
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

// ── ⚠️ THESE ARE REDWOODS, AND DIE_CUT CANNOT DRAW ONE ───────────────────────────────────────────────
// Luke: "tall trees where we can only see the bottom half because its like a redwood forest semi dark."
//
// The house DIE_CUT framing states that no part of the subject may touch any edge — which is exactly right
// for a hatchet and exactly wrong for a tree whose whole character is that it runs out of the top of the
// picture. So the trunks compose their own framing from HOUSE_STYLE and NEGATIVE_STYLE and skip DIE_CUT.
// The same reasoning killed the painted prison bars in the brig; there it ended in a horned ogre.
//
// Drawn PORTRAIT (1024x1536) rather than square, because a towering trunk in a square is a thin sliver with
// wasted air either side, and the crown is not in shot to fill it.
//
// ⚠️ AND EACH SPECIES IS DESCRIBED BY ITS BARK. The crown used to be how you told a birch from an oak, and
// the crown is now above the top of the frame — so the leaves are gone from every prompt and the trunk does
// all the work: colour, texture, the shape of the roots.
const TRUNK_FRAMING =
    "An ENORMOUS ancient tree seen from close to its base, the viewer looking slightly upward. The trunk is "
    + "so vast it fills most of the width of the frame and runs straight off the TOP edge — the crown is far "
    + "overhead and completely out of shot. Only the lower trunk and the spreading roots are visible, with a "
    + "little clear space beneath the roots at the bottom. Nothing else in the picture. Isolated on a FULLY "
    + "TRANSPARENT background: no ground, no undergrowth, no other trees, no cast shadow, no background.";
const trunkPrompt = (subject) => [subject, TRUNK_FRAMING, HOUSE_STYLE, NEGATIVE_STYLE].join(" ");

const TREES = {
    birch: "a colossal birch: chalk-white bark peeling in fine papery curls, ringed with black scars and dark knot-eyes, slender pale roots",
    pine: "a colossal pine: thick red-brown bark broken into deep jigsaw plates, amber resin bleeding from the seams, a broad flaring base",
    oak: "a colossal ancient oak: heavily furrowed grey-brown bark in deep vertical ridges, a massive knotted burl low on the trunk, huge buttressed roots",
    ash: "a colossal ash: smooth pale silver-grey bark with fine dark fissures near the base, clean and upright, roots gripping tight",
    blackthorn: "a colossal blackthorn: near-black bark, long iron-hard thorns bristling straight out of the trunk itself, twisted and sinewy",
    ironwood: "a colossal ironwood: blue-grey bark that looks like riveted iron plate, hard angular facets and seams of rust, unnaturally straight",
    heartwood: "a colossal heartwood: deep red-brown bark split open in a long vertical wound down the trunk, a molten crimson glow pouring out of the crack, embers in the grain",
    moonash: "a colossal moonash: luminous silver-white bark glowing softly with cold blue light, pale veins running up the trunk, faint motes drifting off it",
};

const AXE_EXTRA = "Held VERTICALLY, head at the top and haft running straight down to the bottom of the frame, "
    + "blade facing LEFT. Upright like an axe standing against a wall, never lying flat or diagonal.";

const AXES = {
    hatchet: "a small notched hand hatchet with a worn wooden handle and a chipped, dull iron head",
    felling: "a proper felling axe with a long straight pale ash handle and a clean bright steel head",
    broad: "a heavy broadaxe with a wide flaring bearded blade and a thick oiled wooden haft bound in leather",
    black: "a blackened iron axe with a dark angular head, iron banding down the haft and a faint ember glow in the bevel",
    silvered: "an ornate silvered axe with a mirror-bright engraved head, blue-white sheen and a pale wrapped grip",
    heart: "a legendary greataxe with a crimson-cored blade that glows from within like split heartwood, gold filigree and a dark heavy haft",
};

const PIECES = {
    ...Object.fromEntries(Object.entries(TREES).map(([id, p]) => [`trees/${id}`, { raw: trunkPrompt(p), sprite: true, size: "1024x1536", tall: true }])),
    ...Object.fromEntries(Object.entries(AXES).map(([id, p]) => [`axes/${id}`, { subject: p, extra: AXE_EXTRA, sprite: true }])),
    stump: { subject: "a freshly cut tree stump, pale raw wood across the cut face with the rings showing, "
        + "bark dark around the rim, a few chips and splinters at its foot", sprite: true },
    // The place itself. Deliberately empty in the middle band, because six trees are about to stand there.
    grove: { subject: "A redwood forest at dusk seen straight on: immense reddish-brown trunks rising out "
        + "of frame on both sides and receding into a soft blue-grey haze, a bed of dark needles and fallen "
        + "leaves underfoot, low drifting mist, and pale shafts of light slanting down between the trunks "
        + "from high above. SEMI-DARK rather than black — the far trunks and the mist stay clearly visible "
        + "and the ground reads. Quiet and enormous; no people, no animals, no buildings, no path. The "
        + "MIDDLE of the frame is open ground with nothing standing in it. One continuous painting edge to "
        + "edge: no panel, no inset rectangle, no frame, no border, no seam",
        sprite: false, size: "1536x1024" },
};

let spent = 0;
for (const [id, p] of Object.entries(PIECES)) {
    if (only.length && !only.some((o) => id.includes(o))) continue;
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { console.log(`  ${id}: already drawn`); continue; }
    const body = {
        model: "gpt-image-1",
        prompt: p.raw || housePrompt(p.subject, { framing: p.sprite ? "sprite" : "scene", extra: p.extra || "" }),
        size: p.size || "1024x1024", output_format: "png", quality: "medium", n: 1,
    };
    if (p.sprite) body.background = "transparent";
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    if (!r.ok) { console.log(`  ${id}: OpenAI ${r.status} ${(await r.text()).slice(0, 140)}`); continue; }
    const j = await r.json();
    let img = sharp(Buffer.from(j.data[0].b64_json, "base64"));
    // Trees and axes are drawn at a few hundred pixels; 1024 of them is a megabyte of nothing.
    // A trunk is stored tall; everything else stays square.
    if (p.sprite) {
        img = p.tall
            ? img.resize(512, 768, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            : img.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    const png = await img.png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, png);
    spent += 0.04;
    console.log(`  ${id.padEnd(18)} ${Math.round(png.length / 1024)}kb`);
}
console.log(`\nabout $${spent.toFixed(2)}`);
