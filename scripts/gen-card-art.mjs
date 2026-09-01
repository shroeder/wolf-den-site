// ── CARD ART: THE PICTURE IN THE WINDOW ──────────────────────────────────────────────────────────────────────
// A card in Spire does not show a cut-out of a creature standing still; it shows the ACTION — a fist coming at
// you, a shield taking a hit — painted edge to edge inside its frame. That is why their cards read as cards
// and a transparent sprite floated on a panel reads as a sticker.
//
// So each card gets its own full-bleed illustration of its pet DOING THE THING the card does. The pet sprites
// stay exactly where they are (they are the pet's portrait, and every other screen uses them); this is a second
// asset for a second job.
//
// REUSABLE, in three senses that all mattered:
//   · Keyed by CARD ID, so a card that changes its pet keeps its art and a new card is one entry below.
//   · Written as files under public/images/cards, so the deck view, a reward screen and the compendium all
//     draw the same picture without asking anything for it.
//   · The card falls back to the pet's own sprite when a file is missing, so a card can exist and be played
//     the day it is written and get its portrait later — the art is never a blocker on the rules.
//
// QUALITY: medium, deliberately, against the house default of low (see QUALITY_NOTE in art-style.js). Luke
// asked for these to be COLOURFUL, and "washed palette" is the documented failure of low — it is the exact
// axis being asked for. ~$0.063 an image at 1536x1024; the whole set below is about twenty cents.
//
// Run:  node scripts/gen-card-art.mjs [--force] [--only bite,hop]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/cards";
fs.mkdirSync(OUT, { recursive: true });

// The window the art sits in is a wide letterbox, so these are composed landscape and stored landscape —
// a square illustration cropped to a letterbox loses the top and bottom of whatever was worth drawing.
const SIZE = "1536x1024";

// One entry per card id in CARDS (cards-kit.js). The subject is the ONLY part that varies — everything else
// comes from housePrompt so these belong to the same world as the pets, the foes and the mine.
const ART = {
    bite: "a small grey wolf pup lunging straight at the viewer mid-bite, jaws wide and teeth bared, front paws "
        + "reaching, fur ruffled by the lunge, speed streaks trailing behind it, a cold moonlit forest clearing "
        + "beyond",
    hop: "a bright green frog springing upward off a wet mossy stone, legs kicked out behind it, a burst of "
        + "water droplets and spreading ripples below, tall reeds and a sunlit pond behind",
    pounce: "an orange fox kit caught mid-pounce in the air, front paws thrown forward and claws out, bushy "
        + "tail streaming behind, autumn leaves kicked up and scattering around it, a golden dusk field beyond",
};

// Card art is looked at small and in a hurry, between reading a cost and reading a sentence. It needs one
// clear action and a loud palette, not a landscape somebody has to study.
const EXTRA = "Composed for a small wide card window: ONE clear action filling the frame, read in a glance. "
    + "Vivid saturated colour, strong colour contrast between the subject and the background, and a bright key "
    + "light on the subject so it separates from the backdrop. The subject is the hero of the frame and sits "
    + "central — keep the busiest detail away from the far left and right edges, which the window crops.";

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0, spent = 0;
for (const [id, subject] of Object.entries(ART)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id}.webp`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = housePrompt(subject, { framing: "scene", extra: EXTRA });
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: SIZE, output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Stored at 512 wide: the window draws it at 76 CSS px (152 on a 2x phone), so anything larger is bytes
    // nobody sees. webp because it is the format every other painted asset in here uses.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .resize(512, 341, { fit: "cover", position: "attention" })
        .webp({ quality: 86 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1; spent += 0.063;
    console.log(`  ${id.padEnd(10)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (already on disk; --force to redraw) — about $${spent.toFixed(2)}`);
