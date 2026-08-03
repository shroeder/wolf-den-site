// Sprites for THE KITCHEN's upgrade tracks and view tabs.
//
// These were emoji — 🔥🧂🍲🧺 on the upgrade cards and 🍳🧺🔨 on the view tabs. Emoji are the operating
// system's artwork, not ours: they render differently on every device and sit in the middle of hand-painted
// game art looking borrowed. Same treatment the mine's tracks got.
//
// They render at ~22px on the upgrade chip and ~20px on a tab, so silhouette is everything — one object,
// unmistakable at a glance, no fine detail that turns to mush.
//
// House rule: never ask for outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the
// cutout that then has to be stripped. Bold INK CONTOUR is the wanted look; a die-cut border is not.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY in local.properties");

const BASE =
    "cel-shaded cartoon game asset, bold clean dark ink contours and rich saturated color, mobile RPG art style, "
    + "ONE single object, centered, shown ENTIRELY within the frame with generous empty margin on all four sides, "
    + "nothing cropped or touching any edge, three-quarter view, polished and glossy, "
    + "fully TRANSPARENT background — no ground, no scene, no shadow, no text, no border, no sticker edge.";

const ASSETS = [
    // ── UPGRADE TRACKS ──
    { file: "track-heat.png", prompt: `A roaring COOKING FLAME — a single bright curl of orange and yellow fire with a hot blue base, the kind that sits under a pan. Lively and warm. ${BASE}` },
    { file: "track-season.png", prompt: `A small ceramic SALT AND SPICE SHAKER tipped mid-pour, a fine arc of golden seasoning grains spilling from its holes. Cheerful kitchen object. ${BASE}` },
    // Big Pot no longer buys extra cooks — it makes the dish BIGGER — so the art is an overflowing pot, not
    // just a pot: the abundance is the whole point of the upgrade.
    { file: "track-pot.png", prompt: `A big round cast-iron COOKING POT, generously full and brimming over — thick stew heaped above the rim with a carrot and a sprig of herb poking out, steam curling up. Reads as ABUNDANCE, a pot too full for its own good. ${BASE}` },
    { file: "track-larder.png", prompt: `A woven wicker PANTRY BASKET packed full of preserved food — a loaf, a wheel of cheese, a corked jar and a bundle of herbs stacked inside. Cosy and well stocked. ${BASE}` },

    // ── VIEW TABS ──
    { file: "tab-recipes.png", prompt: `An open COOKBOOK with a warm parchment page, a ribbon bookmark and a small sprig of rosemary resting on it. Pages show only abstract squiggles suggesting handwriting — absolutely NO real letters, NO readable words. ${BASE}` },
    { file: "tab-pantry.png", prompt: `A glass PRESERVE JAR with a cloth-covered lid tied with twine, packed with colourful pickled vegetables. Homely larder storage. ${BASE}` },
    { file: "tab-upgrades.png", prompt: `A sturdy kitchen UPGRADE tool — a brass and copper cooking thermometer-and-whisk crossed together, gleaming, clearly "make the kitchen better". ${BASE}` },
];

// gpt-image-1 returns a 1024² PNG at ~1.5MB. These render at ~22px, so ship them at 256 like every other
// sprite in the game — same picture, ~3% of the bytes.
const ICON_PX = 256;
const shrink = (buf) => sharp(buf)
    .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

const OUT_DIR = "public/images/cooking";
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const a of ASSETS) {
    const dest = `${OUT_DIR}/${a.file}`;
    if (fs.existsSync(dest) && !process.argv.includes("--force")) {
        console.log(`skip ${a.file} — already exists (pass --force to redo)`);
        continue;
    }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: a.prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "low", n: 1 }),
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
