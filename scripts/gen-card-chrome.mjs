// ── THE CARD'S CHROME: FRAME, WINDOW RIMS, RIBBON ────────────────────────────────────────────────────────────
// Spire's card furniture is PAINTED — a moulded frame, a rim around the picture, a cloth banner with folded
// ends — and ours was CSS: gradients, a border and a clip-path. That reads as a web component pretending to be
// a card. This draws the furniture.
//
// FIVE GENERATIONS, FIFTEEN FILES. Everything is drawn ONCE in neutral metal and tinted locally into the
// rarity variants with sharp, off RARITY_META — the same ladder the rest of the game colours by. That means:
//   · a new rarity is a re-tint, not a generation
//   · the tints cannot drift from the colours used everywhere else
//   · the bill is five images (~21c) instead of fifteen
//
// TYPE IS THE WINDOW'S SHAPE, RARITY IS THE COLOUR. Straight off their own cards: an attack window comes to a
// point, a skill is a rounded rectangle, a power is a circle; common is grey, uncommon blue, rare gold. The
// shapes are generated hollow — a rim with nothing inside it — so the card art shows through the middle and
// one rim serves every card of that type.
//
// Run:  node scripts/gen-card-chrome.mjs [--force] [--only frame,rim-attack]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { RARITY_META } from "../src/lib/marketplace/rarity.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/cards/chrome";
fs.mkdirSync(OUT, { recursive: true });

// Painted UI furniture has two failure modes an image model falls into unprompted: it draws the frame in
// PERSPECTIVE (a card lying on a table), and it fills the middle in. Both are fatal here — this has to sit
// flat behind live text at an exact size — so both are named.
const CHROME = "Drawn FLAT ON, straight from the front, perfectly symmetrical left to right, with NO "
    + "perspective, no tilt, no thickness receding away, and no shadow cast onto anything. The MIDDLE IS "
    + "COMPLETELY EMPTY — fully transparent, nothing drawn inside it at all, not a panel, not a colour, not a "
    + "texture: only the border itself is painted. Centred, with a few pixels of empty space outside it.";
// Neutral on purpose: it gets tinted into every rarity below, and a hue baked in here fights the tint.
const METAL = "Forged from pale neutral grey-silver metal with hammered facets, subtle rivets at the corners, "
    + "and a bright specular edge along the top — desaturated, almost no colour of its own.";

const PIECES = {
    // The card's outer moulding. One asset for every card in the game: the pet-coloured stock shows through
    // the hollow middle, exactly as the character colour does on theirs.
    frame: {
        size: "1024x1536", store: { w: 252, h: 318 },
        subject: "An ornate empty rectangular card frame with softly rounded corners — a narrow moulded border "
            + "and nothing whatsoever inside it. " + METAL,
    },
    // ── THE THREE WINDOW RIMS ── the shape IS the card type.
    "rim-attack": {
        // WIDE, not tall. The first draw was a portrait shield and the window it has to fit is a landscape
        // letterbox — stretching one into the other squashes the point flat and it stops reading as a shield.
        size: "1536x1024", store: { w: 240, h: 150 },
        subject: "An empty BROAD LOW pentagonal window rim, much WIDER than it is tall, shaped like a wide "
            + "shield: a long flat top edge, short straight sides, and the bottom sweeping down to a single "
            + "point at the centre. A narrow moulded rim and nothing inside it. " + METAL,
    },
    "rim-skill": {
        size: "1024x1024", store: { w: 240, h: 168 },
        subject: "An empty rounded-rectangle window rim, wider than it is tall, with generously rounded "
            + "corners. A narrow moulded rim and nothing inside it. " + METAL,
    },
    "rim-power": {
        size: "1024x1024", store: { w: 240, h: 240 },
        subject: "An empty circular window rim — a plain ring. A narrow moulded rim and nothing inside it. "
            + METAL,
    },
    // The ribbon. Its ENDS are the whole point: they fold and hang below the bar, which is what makes it read
    // as cloth draped over a card rather than a coloured strip.
    banner: {
        size: "1536x1024", store: { w: 300, h: 96 },
        subject: "A long horizontal cloth ribbon banner stretched straight across, its two ends folded back on "
            + "themselves and hanging slightly BELOW the bar with a notched V cut into each tail. The bar "
            + "itself is smooth and unbroken, empty, with nothing written on it. Woven cloth with a stitched "
            + "hem, in pale neutral grey — desaturated, almost no colour of its own.",
    },
};

const RETINT = process.argv.includes("--retint");
const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");
// The three the cards actually use today. Everything above eternal tints the same way if it is ever needed.
const TINTS = ["common", "rare", "legendary"];

let made = 0, skipped = 0, spent = 0;
for (const [id, piece] of Object.entries(PIECES)) {
    if (only && !only.has(id)) continue;
    const base = `${OUT}/${id}.png`;
    if (RETINT) {
        // Bases drawn before this script stored them at size: bring them down in place.
        const cur = await sharp(base).metadata();
        if (cur.width !== piece.store.w) {
            const small = await sharp(base).resize(piece.store.w, piece.store.h, { fit: "fill" }).png({ compressionLevel: 9 }).toBuffer();
            fs.writeFileSync(base, small);
            console.log(`  ${id.padEnd(11)} resized -> ${piece.store.w}x${piece.store.h}`);
        }
        continue;
    }
    if (fs.existsSync(base) && !FORCE) { skipped += 1; continue; }
    const prompt = housePrompt(piece.subject, { extra: CHROME });
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt, size: piece.size,
            background: "transparent", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Trimmed to the furniture itself, then stored at three times the size it is DRAWN. A card is 84px wide;
    // a 2.5MB full-resolution frame behind it is bytes nobody sees and a phone still has to fetch.
    const trimmed = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 8 })
        .resize(piece.store.w, piece.store.h, { fit: "fill" })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(base, trimmed);
    made += 1;
    spent += piece.size === "1024x1024" ? 0.042 : 0.063;
    console.log(`  ${id.padEnd(11)} ${(trimmed.length / 1024).toFixed(0)}kb`);
}

// ── AND THE TINTS, LOCALLY AND FOR NOTHING ───────────────────────────────────────────────────────────────
// tint() multiplies the colour through while keeping the metal's own light and shade, which is exactly what a
// painted-then-coloured piece of furniture should do. Greyscale first so the source's residual hue cannot
// skew the result.
for (const id of Object.keys(PIECES)) {
    if (only && !only.has(id)) continue;
    const base = `${OUT}/${id}.png`;
    if (!fs.existsSync(base)) continue;
    for (const rarity of TINTS) {
        const hex = RARITY_META[rarity].color;
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        await sharp(base).greyscale().tint({ r, g, b }).png({ compressionLevel: 9 }).toFile(`${OUT}/${id}-${rarity}.png`);
    }
    console.log(`  ${id.padEnd(11)} tinted -> ${TINTS.join(", ")}`);
}

console.log(`\ndrew ${made}, skipped ${skipped} — about $${spent.toFixed(2)}, plus ${Object.keys(PIECES).length * TINTS.length} tints for nothing`);
