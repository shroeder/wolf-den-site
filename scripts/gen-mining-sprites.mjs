// Sprites for THE MINE: five ore seams and five pickaxe forms.
//
// The ore has to read at a glance in a dark cave at ~54px, so each one is a chunky embedded seam with its
// tier's colour doing the work — grey coal through molten emberheart. The pickaxes are the upgrade ladder and
// sit next to your hero at ~52px, so they escalate in silhouette as well as material: a bent scrap tool at the
// bottom, an ornate glowing maul at the top.
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
    // ── ORE SEAMS (mkt ore tiers 1..5) ──
    { file: "ore-coal.png", prompt: `A chunk of dark grey ROCK with glossy BLACK COAL nuggets embedded in it, a few dull facets catching light. Humble and heavy. ${BASE}` },
    { file: "ore-iron.png", prompt: `A chunk of grey ROCK veined with raw IRON ORE — rusty red-brown streaks and dull silver metallic flecks running through the stone. ${BASE}` },
    { file: "ore-silver.png", prompt: `A chunk of dark rock threaded with bright SILVER ORE — clean cool-blue metallic veins and small mirror-bright crystalline facets. ${BASE}` },
    { file: "ore-mythril.png", prompt: `A chunk of dark stone shot through with MYTHRIL — luminous violet-purple metallic veins with a soft inner glow and a few floating motes of purple light. ${BASE}` },
    { file: "ore-emberheart.png", prompt: `A cracked geode of black volcanic rock split open to reveal a molten ORANGE-GOLD crystalline core, glowing cracks spidering across the outside, faint embers drifting up. Clearly the rarest find. ${BASE}` },

    // ── PICKAXE FORMS (upgrade ladder) ──
    { file: "pick-worn.png", prompt: `A battered old PICKAXE — crooked wooden handle bound with frayed twine, chipped rusty iron head, clearly the cheapest tool in the shed. ${BASE}` },
    { file: "pick-iron.png", prompt: `A solid workmanlike IRON PICKAXE — straight oak handle, clean forged iron head with a bright sharpened point, a couple of rivets. Honest and well kept. ${BASE}` },
    { file: "pick-steel.png", prompt: `A fine STEEL PICKAXE — polished blue-steel head with a mirror edge, leather-wrapped grip, brass collar where head meets haft. Craftsman's tool. ${BASE}` },
    { file: "pick-mythril.png", prompt: `A MYTHRIL PICKAXE — slender luminous violet-purple metal head with a soft inner glow, dark wrapped haft, faint purple motes drifting from the tip. Magical but still a tool. ${BASE}` },
    { file: "pick-emberheart.png", prompt: `An ornate legendary EMBERHEART PICKAXE — obsidian-black head inlaid with glowing molten-orange geometric inlay (abstract shapes only, absolutely NO letters, NO writing, NO symbols resembling text), gold filigree collar, dark wrapped haft, embers drifting from the head. Clearly the ultimate version of a miner's tool. ${BASE}` },
];

// gpt-image-1 returns a 1024² PNG at ~1.5MB. These render at ~54px, so ship them at 256 like the fish
// sprites do — same picture, ~3% of the bytes, and ten of them are otherwise 15MB of repo and page weight.
const ICON_PX = 256;
const shrink = (buf) => sharp(buf)
    .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

const OUT_DIR = "public/images/mining";
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
        // low quality by default, per the house standard — these render small.
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
