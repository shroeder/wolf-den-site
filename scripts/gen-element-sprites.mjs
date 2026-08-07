// The six ELEMENT markers that ride the corner of every gear icon.
//
// Asked for in global chat: "mini elemental markers on our gear icons so we can tell what element a piece is
// just from the over view without having to click into each piece." Element was previously a text chip that
// only existed on the slot picker and the detail sheet, so the bag, the Forge, the auction house and a public
// profile were all walls of gear you had to open one at a time to read the one stat that matters against a
// boss with a rotating weakness.
//
// These render TINY — around 14px on a 46px bag tile, up to ~24px on a 76px forge card. Two consequences drive
// every prompt below:
//
//   1. SILHOUETTE CARRIES, NOT DETAIL. Each of the six has to be a different SHAPE, not merely a different
//      colour — a flame, a droplet, a leaf, a bolt, a sunburst, a crescent. Colour alone fails at 14px and
//      fails outright for a colourblind player.
//   2. FILL THE FRAME. Every other generator asks for generous margin because its art sits alone on a card.
//      A marker that arrives with 30% padding baked in renders at 10px inside a 14px box and disappears. So
//      these ask for the emblem to fill the frame edge to edge.
//
// House rule: never ask for outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the
// cutout. Bold INK CONTOUR is the wanted look; a die-cut border is not.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY in local.properties");

// Note what is NOT here: "generous empty margin". A marker fills its frame or it is not legible.
const BASE =
    "cel-shaded cartoon game icon, bold clean dark ink contours and rich saturated color, mobile RPG art style, "
    + "ONE single simple emblem, centered, FILLING THE FRAME edge to edge with only a very thin margin, "
    + "flat graphic front-on view, strong simple silhouette that stays readable when shrunk to 16 pixels, "
    + "no fine detail, no small parts, no texture noise, "
    + "fully TRANSPARENT background — no ground, no scene, no shadow, no glow halo, no circle behind it, "
    + "no text, no letters, no numbers, no border, no outline ring, no sticker edge.";

const ELEMENTS = [
    // Six distinct silhouettes. Read them as a set: pointed / round-bottomed / broad / jagged / radiating / crescent.
    { file: "fire.png", prompt: `A single bold FLAME — one clean teardrop-shaped tongue of fire tapering to a point at the top, with one small inner flame. Vivid orange and red with a hot yellow core. ${BASE}` },
    { file: "water.png", prompt: `A single bold WATER DROPLET — a classic teardrop, round and heavy at the bottom, tapering to a point at the top, with one small white highlight. Vivid cyan and deep blue. ${BASE}` },
    { file: "earth.png", prompt: `A single bold LEAF — one broad rounded leaf with a thick central vein and a short stem at the bottom. Vivid grass green with a deeper green edge. ${BASE}` },
    { file: "storm.png", prompt: `A single bold LIGHTNING BOLT — one sharp jagged zigzag striking downward, thick and angular. Vivid golden yellow with a pale white core. ${BASE}` },
    { file: "light.png", prompt: `A single bold SUNBURST — a round sun disc with eight thick triangular rays radiating evenly outward. Warm gold and pale cream, bright and clean. ${BASE}` },
    { file: "shadow.png", prompt: `A single bold CRESCENT MOON — one thick curved crescent, horns pointing to the right, solid and heavy. Deep violet and dark purple with a faint lilac inner edge. ${BASE}` },
];

const ICON_PX = 256;
// `contain` (not `cover`) so nothing generated is cropped away, and trim() first so any margin the model added
// anyway is removed before the resize — the marker then genuinely fills its 256px box.
const shrink = (buf) => sharp(buf)
    .trim({ threshold: 6 })
    .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

fs.mkdirSync("public/images/elements", { recursive: true });
for (const a of ELEMENTS) {
    const dest = `public/images/elements/${a.file}`;
    if (fs.existsSync(dest) && !process.argv.includes("--force")) {
        console.log(`skip ${a.file} — already exists (pass --force to redo)`);
        continue;
    }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // medium, not low: `low` sheds detail furthest from the focal point, and on a shape this small that
        // means a bolt losing its point or a crescent closing into a blob. Six images, one time.
        body: JSON.stringify({ model: "gpt-image-1", prompt: a.prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) {
        console.log(`FAILED ${a.file}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 200)}`);
        continue;
    }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`FAILED ${a.file}: no image returned`); continue; }
    fs.writeFileSync(dest, await shrink(Buffer.from(b64, "base64")));
    console.log(`wrote ${dest} ${fs.statSync(dest).size} bytes`);
}
console.log("done");
