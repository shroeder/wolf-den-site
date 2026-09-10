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
import { housePrompt } from "../src/lib/marketplace/art-style.js";
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

// A tree has to read at a glance in a row of six, and it is TAPPED — so silhouette first, and nothing
// touching the frame edge or it looks cropped rather than die-cut.
const TREE_EXTRA = "A single whole tree seen from the side, trunk to crown, standing upright and centred with "
    + "clear space on all four sides. The SILHOUETTE is the whole job: this is looked at small and tapped, so "
    + "the shape of the crown and the line of the trunk must be readable instantly. No ground, no grass, no "
    + "shadow, no other trees, no background.";

const TREES = {
    birch: "a slender white-barked birch with black scars along its trunk and a light airy crown of small pale green leaves",
    pine: "a tall straight dark-green pine with layered downswept boughs and a narrow pointed crown, rough red-brown bark",
    oak: "a broad heavy old oak with a thick gnarled trunk and a wide dense dark-green canopy, deeply furrowed bark",
    ash: "an upright grey-barked ash with a high open crown of feathered leaves and smooth pale silver-grey bark",
    blackthorn: "a low twisted blackthorn, near-black bark, dense vicious thorns along every branch, sparse dark purple-tinged leaves",
    ironwood: "a massive iron-grey tree with a trunk like riveted metal plate, hard angular branches and stiff blue-grey foliage",
    heartwood: "an ancient tree with deep red-brown bark split open to show a glowing warm crimson core, sparse copper leaves",
    moonash: "a pale luminous white tree with silver-blue bark that glows faintly, delicate drooping branches hung with soft blue light",
};

// ⚠️ EVERY AXE HANGS THE SAME WAY OR THE SWING ROTATES ONE OF THEM WRONG. The first pass said only "seen
// from the side" and the Felling Axe came back lying flat while the other five stood upright — which in a
// swing animation is an axe going through the tree sideways. Stated as an orientation, not a viewpoint.
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
    ...Object.fromEntries(Object.entries(TREES).map(([id, p]) => [`trees/${id}`, { subject: p, extra: TREE_EXTRA, sprite: true }])),
    ...Object.fromEntries(Object.entries(AXES).map(([id, p]) => [`axes/${id}`, { subject: p, extra: AXE_EXTRA, sprite: true }])),
    stump: { subject: "a freshly cut tree stump, pale raw wood across the cut face with the rings showing, "
        + "bark dark around the rim, a few chips and splinters at its foot", sprite: true },
    // The place itself. Deliberately empty in the middle band, because six trees are about to stand there.
    grove: { subject: "A dark pine forest at night seen straight on: dense black trunks receding into fog, a "
        + "faint cold blue mist between them, the ground a bed of dark needles and scattered fallen leaves, a "
        + "sliver of moonlight coming down from the upper left. Deep, quiet and empty -- no people, no animals, "
        + "no buildings, no path. The MIDDLE of the frame is open ground with nothing standing in it. "
        + "⚠️ ONE CONTINUOUS PAINTING edge to edge: no panel, no inset rectangle, no frame, no border, no "
        + "seam, no straight-edged patch of lighter sky. The first draft came back with a rectangular "
        + "lighter box around the moon, which reads as a rendering fault rather than as a forest",
        sprite: false, size: "1536x1024" },
};

let spent = 0;
for (const [id, p] of Object.entries(PIECES)) {
    if (only.length && !only.some((o) => id.includes(o))) continue;
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { console.log(`  ${id}: already drawn`); continue; }
    const body = {
        model: "gpt-image-1",
        prompt: housePrompt(p.subject, { framing: p.sprite ? "sprite" : "scene", extra: p.extra || "" }),
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
    if (p.sprite) img = img.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const png = await img.png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, png);
    spent += 0.04;
    console.log(`  ${id.padEnd(18)} ${Math.round(png.length / 1024)}kb`);
}
console.log(`\nabout $${spent.toFixed(2)}`);
