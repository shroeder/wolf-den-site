// Sprites for the four dig TOOLS.
//
// The tools were the one upgrade track in the game still drawn as an emoji in a flat row, while every other
// track — boat, kitchen, farm, excavation — gets a real sprite, a level bar and a now→next readout. These are
// the missing art.
//
// Each is the IMPLEMENT itself, not the effect: an object you'd pick up, so the four read as a set of tools
// getting progressively more serious rather than four explosions. Square, centred, transparent — they sit in a
// small round bezel in the UI.
import fs from "node:fs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY in local.properties");

// House rule: never ask for outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the
// cutout that then has to be stripped. Bold INK CONTOUR is the wanted look; a die-cut border is not.
const BASE =
    "cel-shaded cartoon game asset, bold clean dark ink contours and rich saturated color, mobile RPG art style, "
    + "ONE single small object, centered, shown ENTIRELY within the frame with generous empty margin on all four sides, "
    + "nothing cropped or touching any edge, three-quarter view, polished and glossy, "
    + "fully TRANSPARENT background — no ground, no scene, no shadow, no text, no border, no sticker edge.";

const TOOLS = [
    {
        id: "wide",
        file: "tool-wide.png",
        prompt: `A sturdy short-handled WIDENING SPADE with an unusually broad squared-off steel blade, worn leather grip, a couple of bright rivets. Honest hand tool, well used but cared for. ${BASE}`,
    },
    {
        id: "deep",
        file: "tool-deep.png",
        prompt: `A bundle of two red MINING BLAST CHARGES bound with twine, short fuses lit with a small warm spark, brass end caps. Compact and hefty. ${BASE}`,
    },
    {
        id: "quake",
        file: "tool-quake.png",
        prompt: `A heavy two-handed SLEDGEHAMMER with a huge blocky iron head, thick oak shaft, iron banding at the neck, faint glowing amber cracks running through the head as if it strikes hard enough to split ground. ${BASE}`,
    },
    {
        id: "cataclysm",
        file: "tool-cataclysm.png",
        prompt: `An ornate legendary EXCAVATION MAUL, obsidian-black head inlaid with glowing molten-orange geometric inlay patterns (abstract shapes only, absolutely NO letters, NO writing, NO symbols resembling text), gold filigree collar, dark wrapped haft, small embers drifting from the head. Clearly the ultimate version of a digging tool. ${BASE}`,
    },
];

const OUT_DIR = "public/images/sailing";

for (const t of TOOLS) {
    const dest = `${OUT_DIR}/${t.file}`;
    if (fs.existsSync(dest) && !process.argv.includes("--force")) {
        console.log(`skip ${t.id} — ${dest} already exists (pass --force to redo)`);
        continue;
    }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // low quality by default, per the house standard — these render at ~44px in a bezel.
        body: JSON.stringify({ model: "gpt-image-1", prompt: t.prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "low", n: 1 }),
    });
    if (!resp.ok) {
        console.log(`FAILED ${t.id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 200)}`);
        continue;
    }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`FAILED ${t.id}: no image returned`); continue; }
    fs.writeFileSync(dest, Buffer.from(b64, "base64"));
    console.log(`wrote ${dest} ${fs.statSync(dest).size} bytes`);
}
console.log("done");
