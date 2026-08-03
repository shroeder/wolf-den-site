// Sprites for the REWARD KINDS the whole game shares, plus the Kitchen's remaining emoji.
//
// Two jobs in one script:
//
// 1. public/images/ui/ — the kinds every feature hands out: gold, a chest, forge parts, a consumable, seeds,
//    a wheel spin, a Creation token. These lived in public/images/mining/ because the mine happened to need
//    them first, so the Kitchen either reached into another feature's folder or fell back to an emoji. They
//    belong to nobody now, which is the point.
//
// 2. public/images/cooking/ — the last emoji actually rendering in the Kitchen: the spoon riding the timing
//    bar (always on screen), the plate a recipe falls back to, the prepped-ingredient chip, and the bounty
//    card's icon.
//
// The four we already have (coins, chest, potion, and the gear helm) are MOVED rather than redrawn — same art,
// new home. Only what was genuinely missing is generated.
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
    // ── SHARED REWARD KINDS ──
    // No pouch, no sack, no label — a bag is a surface and the model writes on surfaces. Loose seeds only.
    { dir: "ui", file: "seed.png", prompt: `A small loose PILE of plump brown-and-tan plant seeds heaped together, with one tiny green sprout with two leaves rising from the middle of the pile. NO bag, NO sack, NO pouch, NO container, NO label, NO paper, NO writing of any kind. ${BASE}` },
    { dir: "ui", file: "parts.png", prompt: `A neat little pile of FORGE SCRAP — a bent iron bracket, two thick rivets and a curl of steel shaving stacked together, raw crafting material rather than a finished tool. Metallic greys with warm rust edges. ${BASE}` },

    // ── THE WHEEL ──
    // A recipe is a WEDGE on the daily spin now, so it needs art that sits with the other prize sprites
    // (coins, chest, potion, seed pouch) and reads at wedge size.
    // Unfurl ANY of it and the model writes on it — it came back with "RECIFE" printed across the front. So:
    // fully rolled, ends only, no face showing. There is nothing to write on.
    { dir: "spin/prizes", file: "recipe-scroll.png", prompt: `A tightly ROLLED-UP scroll of cream parchment, bound closed around its middle with a red ribbon and a round red wax seal, a small sprig of green herb tucked under the ribbon. The scroll is COMPLETELY rolled — only the spiral ends are visible, NO flat face, NO unfurled section, NO writing surface anywhere. NO letters, NO words, NO numbers, NO symbols. ${BASE}` },

    // ── THE KITCHEN ──
    // The spoon RIDES the timing bar and is on screen the entire minigame, so it has to read at ~26px and be
    // unmistakable in silhouette. Horizontal, handle to the left, so it looks like a marker travelling a track.
    { dir: "cooking", file: "spoon.png", prompt: `A wooden COOKING SPOON lying HORIZONTALLY, handle pointing left and the rounded bowl on the right, a small dollop of golden stew in the bowl. Warm honey-coloured wood with visible grain. Simple bold silhouette that reads at tiny size. ${BASE}` },
    { dir: "cooking", file: "dish.png", prompt: `A finished PLATED MEAL — a white ceramic plate holding a golden roast portion with a sprig of herb and a swirl of sauce, steam curling up. Appetising and generic enough to stand for any dish. ${BASE}` },
    { dir: "cooking", file: "prep.png", prompt: `A wooden CHOPPING BOARD with a small knife resting on it and a few neatly diced vegetable pieces — orange, green and cream — arranged in a little pile. Reads as "prepped ingredient", mid-preparation rather than a finished meal. ${BASE}` },
    // Was a parchment order ticket, which came back with "KITCHEN ORDER TICKET" printed on it. Anything
    // paper-shaped invites lettering, so: a brass counter bell. Same meaning — orders up — no surface to write on.
    { dir: "cooking", file: "bounties.png", prompt: `A polished brass kitchen COUNTER BELL — the domed press-top service bell that sits on a pass — with a small green herb sprig lying beside its base. Warm gleaming brass. NO paper, NO card, NO ticket, NO label, NO letters, NO numbers, NO writing of any kind anywhere. ${BASE}` },
];

const ICON_PX = 256;
const shrink = (buf) => sharp(buf)
    .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

for (const a of ASSETS) {
    fs.mkdirSync(`public/images/${a.dir}`, { recursive: true });
    const dest = `public/images/${a.dir}/${a.file}`;
    if (fs.existsSync(dest) && !process.argv.includes("--force")) {
        console.log(`skip ${a.dir}/${a.file} — already exists (pass --force to redo)`);
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
