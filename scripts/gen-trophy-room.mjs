// Art for the TROPHY ROOM: the room itself, and one wall-mounted piece per subsystem.
//
// Run with the alias loader so this composes from the house style rather than inventing a twelfth look:
//   node --env-file=../accounting_app/.env --import ./scripts/lib/register-loader.mjs scripts/gen-trophy-room.mjs
//   … --only=arena,forge --force      reroll individual pieces
//
// TWO DELIBERATE CHOICES:
//
// · THE BACKGROUND IS AN EMPTY WALL. The pieces are composited on top at fixed positions, so anything the model
//   paints onto the wall itself would sit UNDER a sprite and read as clutter. The prompt asks for bare timber,
//   stone and empty iron hooks on purpose.
//
// · QUALITY IS SPLIT. The room is drawn at ~700px wide and gets "medium"; the pieces render at 52-108px and get
//   the house default "low". Generating the pieces high buys interior detail the downscale destroys. Whole set
//   is about $0.19 — see estimateImageCost in ai-ledger.js.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history
import { housePrompt } from "@/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY in local.properties");

const OUT_DIR = "public/images/trophy";
fs.mkdirSync(OUT_DIR, { recursive: true });

// Every piece hangs on a wall, lit from the hearth, seen straight on. Saying so once keeps the eleven reading
// as ONE collection in ONE room rather than eleven inventory icons that happen to share a page.
const MOUNTED =
    "A wall-mounted trophy piece displayed on iron hooks or a small wooden plaque, seen straight on from the " +
    "front, warm hearth light from the lower left, slightly worn and well-used as though it has hung there for " +
    "years. Chunky readable silhouette — this is viewed small.";

const PIECES = [
    { id: "arena", subject: `Two crossed arena short-swords over a battered steel gladiator helm with a torn red crest, mounted on a dark oak plaque. ${MOUNTED}` },
    { id: "ships", subject: `A ship's steering wheel of dark varnished oak with polished brass fittings and one splintered broken spoke, a scrap of frayed rope still knotted to it. ${MOUNTED}` },
    { id: "sailing", subject: `A rolled nautical chart tied with cord, a brass telescoping spyglass and a small brass sextant arranged together on a plaque. ${MOUNTED}` },
    { id: "digging", subject: `A worn short-handled digging spade crossed with a round wooden-rimmed sifting sieve, a few gold coins and gem shards caught in the mesh. ${MOUNTED}` },
    { id: "fishing", subject: `A wooden fishing rod crossed with a knotted net float, and one large mounted silver trophy fish above them. ${MOUNTED}` },
    { id: "mining", subject: `A heavy iron pickaxe crossed with a lit miner's oil lantern glowing warm amber, a chunk of raw glittering ore mounted between them. ${MOUNTED}` },
    { id: "delves", subject: `A deep-hooded travelling cloak of dark warded cloth hanging on an iron hook, an empty glass potion flask and a stub of candle on a small shelf beneath it. ${MOUNTED}` },
    { id: "kitchen", subject: `A hanging copper cooking pot with a wooden ladle and a bundle of dried herbs tied above it, all on an iron rack. ${MOUNTED}` },
    { id: "forge", subject: `A blacksmith's hammer crossed with a pair of iron tongs over a small dark anvil, faint orange forge glow catching the metal edges. ${MOUNTED}` },
    { id: "farm", subject: `A curved harvest scythe crossed with a wooden pitchfork, a tied golden wheat sheaf and a small tin seed pail hung between them. ${MOUNTED}` },
    { id: "den", subject: `A carved dark wooden WOLF'S HEAD trophy mount with amber glass eyes and silver-grey fur, on a polished shield-shaped oak plaque — the centrepiece of the room. ${MOUNTED}` },
];

// THE WALL IS THE CANVAS, NOT THE ROOM. The first pass put a stone hearth across the right third and a leather
// armchair across the lower left, which looked wonderful and left only the middle usable: eleven trophies laid
// out over it hung on the fire and behind the chair. So the furniture is pushed to the extreme edges and
// deliberately cropped, and the middle 85% is nothing but wall.
const ROOM = housePrompt(
    "The interior of a cosy medieval hideout — a snug timber-framed room dug into a hillside, seen as one broad " +
    "WALL filling almost the whole frame. The wall is dark oak vertical panelling above a low course of grey " +
    "fieldstone, with heavy carved beams running along the very top edge. It is completely BARE: no pictures, " +
    "no weapons, no shelves of objects, nothing hanging — only a few small empty black iron hooks and bare " +
    "timber. At the extreme LEFT edge, mostly cropped out of frame, the corner of a stone hearth throws warm " +
    "amber firelight across the wall. At the extreme RIGHT edge, mostly cropped, a sliver of a candle sconce. " +
    "Along the very bottom edge a narrow strip of flagstone floor and the top edge of a worn red patterned rug.",
    {
        framing: "scene",
        extra: "Viewed straight on at eye level as a flat backdrop plate, like a theatre flat. The ENTIRE middle " +
            "of the image — every part except the outer 8% at each edge — must be plain empty wall, evenly lit " +
            "and uncluttered, because trophies are composited on top of it and any painted-in object would " +
            "collide with them. No furniture in the middle of the frame. Warm amber firelight from the left " +
            "falling off into deep cosy brown shadow at the right. Rich but LOW CONTRAST across the open wall " +
            "so bright objects placed on it stay readable.",
    }
);

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const force = process.argv.includes("--force");

// gpt-image-1 hands back a 1-2.4MB PNG every time. Shipped raw that is ~22MB of repo for a room drawn at
// 700px and pieces drawn at 52-108px. Store what is actually rendered: webp, at 2x the largest draw size.
// Pieces are TRIMMED first — the die-cut prompt asks for an 8% empty margin, and trimming it back means each
// piece fills its hook instead of floating in a transparent box.
export async function encode(buf, dest, { width, trim }) {
    let img = sharp(buf);
    if (trim) img = img.trim();
    await img.resize({ width, withoutEnlargement: true })
        .webp({ quality: 90, alphaQuality: 100 }).toFile(dest);
    return fs.statSync(dest).size;
}

async function draw(label, dest, prompt, { size, quality, transparent, width }) {
    if (fs.existsSync(dest) && !force) { console.log(`skip ${label} — exists (pass --force to redo)`); return; }
    const body = { model: "gpt-image-1", prompt, size, output_format: "png", quality, n: 1 };
    if (transparent) body.background = "transparent";
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    if (!resp.ok) { console.log(`FAILED ${label}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 300)}`); return; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`FAILED ${label}: no image returned`); return; }
    const bytes = await encode(Buffer.from(b64, "base64"), dest, { width, trim: transparent });
    console.log(`wrote ${dest} — ${(bytes / 1024).toFixed(0)}kb`);
}

if (!only.length || only.includes("room")) {
    await draw("room", `${OUT_DIR}/room-bg.webp`, ROOM, { size: "1536x1024", quality: "medium", transparent: false, width: 1280 });
}
for (const p of PIECES) {
    if (only.length && !only.includes(p.id)) continue;
    await draw(p.id, `${OUT_DIR}/tool-${p.id}.webp`, housePrompt(p.subject), { size: "1024x1024", quality: "low", transparent: true, width: 320 });
}
console.log("done");
