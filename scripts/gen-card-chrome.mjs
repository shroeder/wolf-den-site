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

// ── AND A MATERIAL FOR THE PANEL FURNITURE ───────────────────────────────────────────────────────────────────
// Luke: "I don't really like how you've decided to create these textured buttons and borders, it just looks
// really ghetto and it always seems to just be Gray."
//
// The grey is not an accident and it is not the model's fault — METAL above SAYS "desaturated, almost no
// colour of its own", because everything it describes gets TINTED into rarity colours afterwards. The panel
// is never tinted, so it kept the neutral base and nothing ever put colour back. It also fought the screen it
// sits on: the arena behind it is warm orange and firelight, and a cold grey slab in front of that reads as a
// browser dialog someone dropped on a painting.
//
// So the panel has its own material — blackened iron with brass, lit warm, which is the furniture the rest of
// this game is already made of.
const PANEL = "Forged from BLACKENED IRON, deep near-black charcoal with a soft graphite sheen, and inlaid "
    + "with warm antique BRASS along its raised edges — aged brass with a gentle golden glow, not yellow "
    + "plastic. Lit warmly from above so the brass catches the light and the iron stays dark. Rich and "
    + "restrained: no bright silver, no cold grey, no rust.";

// The type plate is the one piece that is NOT hollow — it is a solid plaque with an emblem struck on top of
// it, so it needs the opposite instruction to everything else here.
const SOLID = "Drawn FLAT ON, straight from the front, perfectly symmetrical left to right, with NO perspective "
    + "and no tilt. SOLID all the way across — a filled plate, not a frame and not a ring — and completely "
    + "BLANK: no emblem, no engraving, no pattern, nothing struck into its face. Centred, with a few pixels of "
    + "empty space outside it.";

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
    // ── THE TYPE PLATE ── a small plaque that says what kind of card this is. It was a CSS rectangle with a
    // word in it, and on a card whose every other edge is painted that is the one piece that looks like a web
    // page. Luke: "the skill/attack/block text and rectangle bothers me, I think its the text and no sprite
    // for a plate."
    plate: {
        size: "1536x1024", store: { w: 240, h: 100 }, extra: SOLID,
        subject: "A small blank horizontal metal name plaque with softly rounded corners and a rivet at each "
            + "end — a solid plate with a plain smooth face. " + METAL,
    },
    // ── AND THE FIGHT SCREENS OWN FURNITURE ──────────────────────────────────────────────────────────────
    // Not card parts: the things AROUND the cards. Spire draws all of these too — its draw and discard piles
    // are little card backs with a count on them, its energy is a big cut gem in a socket, its End Turn is a
    // struck plate. Ours were three text boxes and a yellow rectangle, which is the same fault as the type
    // tab one level out: web widgets sitting on a painted screen.
    //
    // No rarity tints on these — they belong to the screen, not to a card, so there is nothing for a rarity to
    // say about them.
    "card-back": {
        size: "1024x1536", store: { w: 168, h: 240 }, tint: false, extra: SOLID,
        subject: "The BACK of a playing card: a snarling wolf head crest struck in metal, centred on a deep "
            + "midnight-blue field inside a narrow ornamental border. Symmetrical, solid, no writing. " + METAL,
    },
    "energy-gem": {
        size: "1024x1024", store: { w: 200, h: 200 }, tint: false, extra: SOLID,
        subject: "A large round faceted amber gemstone glowing from within, set into a heavy hexagonal metal "
            + "socket with rivets — a solid jewel in its mount, filled, seen straight on. " + METAL,
    },
    "button-plate": {
        size: "1536x1024", store: { w: 300, h: 120 }, tint: false, extra: SOLID,
        subject: "A wide blank rectangular metal button plate with softly rounded corners, gently domed, a "
            + "rivet at each end and a bright bevel along the top edge — solid and completely blank. " + METAL,
    },
    // ── THE TOP BAR ── one plate under the whole control strip.
    // Luke: "If you only generate a Sprite that goes across the top, serves as a back plate for all the
    // buttons and info up there, can we group the info by left and right? and maybe center. That way on
    // desktop, it doesn't feel so spaced out."
    //
    // The two halves of that are one idea: five widgets evenly spaced across 1100px read as five separate
    // things floating on a dark gradient, and a plate under them makes the strip ONE object — at which point
    // clustering them left / centre / right is what the object is for.
    //
    // ── THE TOP BAR ── ⚠️ READ THIS BEFORE CHANGING THE PROMPT OR THE STORE SIZE.
    // Its displayed width is unknown — 1100px on a desktop board, 375 on a phone — and gpt-image-1 will not
    // draw wider than 3:2. The first cut solved that by asking for a bar with NO structure along its length
    // and stretching it edge to edge, on the theory that a lengthways-uniform texture cannot smear. It cannot,
    // but the two rivets can, and they did: stored at 9:1 and shown at 19:1 they flattened into ovals. Luke:
    // "the aspect ratio is kinda not right, the rivets on the left and right look all smoshed vertically."
    //
    // So the shape changed to suit how it is DRAWN rather than how it is generated. It is a THREE-PIECE bar
    // now — a moulded cap at each end and a plain middle — and the component hangs it on border-image, which
    // stretches only the middle and leaves the caps at their own aspect at any width. That is why the caps are
    // asked for as clearly separate blocks: border-image slices them off by pixel count, so they have to end
    // somewhere obvious. CAP_PX below is that number and it is shared with the CSS.
    "top-bar": {
        size: "1536x1024", store: { w: 1200, h: 120 }, tint: false, extra: SOLID,
        // ── CONSTANT HEIGHT, END TO END ──────────────────────────────────────────────────────────────
        // The first three-piece cut drew the caps as blocks standing TALLER than the span between them, and
        // the result read as two chunky terminals bookending a thin rail — with the piles and the End turn
        // button sitting right on top of the caps, because that is exactly where the groups live. The bar has
        // to be one solid object the controls can sit anywhere along, so the ends are DECORATION ON the bar
        // now rather than a different shape from it: same height the whole way, detail inset within it.
        subject: "A long horizontal metal bar seen straight on, EXACTLY THE SAME HEIGHT from one end to the "
            + "other — one solid unbroken plate, never pinched or stepped in the middle. A bright bevelled "
            + "highlight runs the whole length of its top edge and a dark shadowed edge along the bottom. "
            + "Inset WITHIN the bar's own height at each end, and not sticking out past it, sits a small "
            + "decorative square panel with a round domed rivet at its centre. Everything between those two "
            + "end panels is a plain uniform span of hammered metal: no centrepiece, no crest, no join, no "
            + "ornament, nothing written on it. " + METAL,
    },
    // ── THE ONLY FURNITURE A REWARD SCREEN NEEDS ─────────────────────────────────────────────────────────
    // There used to be three pieces here — an ornate panel frame, a stone background texture and a brass
    // button — and all three are gone. Looking at Spire's actual card reward screen settled it: there is NO
    // panel. Three cards sit on the dimmed fight, a painted cloth banner hangs above them with the
    // instruction on it, and the skip is a small flat pill. That is the entire screen.
    //
    // What we had built was MORE ornate than the reference and less well made, which is exactly why it read
    // cheap: every extra piece of furniture was another place to notice the difference. So the frame, the
    // stone and the brass button were deleted and this is what replaced them.
    //
    // Drawn to be stretched: the tails are the detail, the middle is plain cloth, so border-image holds the
    // ends and only the span between them gives.
    "title-banner": {
        size: "1536x1024", store: { w: 900, h: 200 }, tint: false,
        extra: "Drawn FLAT ON, straight from the front, symmetrical left to right, with NO perspective and no "
            + "tilt. The cloth itself is SOLID and opaque; everything around it is fully transparent. Centred, "
            + "with a little empty space above and below.",
        subject: "A long horizontal cloth banner hung across, its two ends flaring out wider than the middle "
            + "and hanging slightly lower, with ragged torn edges and a notched V cut into each tail. The "
            + "middle span is smooth, unbroken and COMPLETELY BLANK — no writing, no emblem, no ornament, no "
            + "stitching across it. Aged parchment-coloured linen, warm pale sand, softly shaded so it reads "
            + "as hanging cloth rather than a flat strip.",
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
    const prompt = housePrompt(piece.subject, { extra: piece.extra || CHROME });
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt, size: piece.size,
            background: piece.opaque ? "opaque" : "transparent", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Trimmed to the furniture itself, then stored at three times the size it is DRAWN. A card is 84px wide;
    // a 2.5MB full-resolution frame behind it is bytes nobody sees and a phone still has to fetch.
    // ⚠️ A TEXTURE MUST NOT BE TRIMMED. trim() exists because every other piece here is furniture floating on
    // transparency and wants its empty margin cut off — but a seamless fill has near-uniform edges BY
    // DEFINITION, so trim reads the whole image as margin and hands back nothing. The first panel background
    // came out as a blank white square for exactly this reason.
    const raw = sharp(Buffer.from(b64, "base64"));
    const trimmed = await (piece.opaque ? raw : raw.trim({ threshold: 8 }))
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
    if (PIECES[id].tint === false) continue;
    for (const rarity of TINTS) {
        const hex = RARITY_META[rarity].color;
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        await sharp(base).greyscale().tint({ r, g, b }).png({ compressionLevel: 9 }).toFile(`${OUT}/${id}-${rarity}.png`);
    }
    console.log(`  ${id.padEnd(11)} tinted -> ${TINTS.join(", ")}`);
}

console.log(`\ndrew ${made}, skipped ${skipped} — about $${spent.toFixed(2)}, plus ${Object.keys(PIECES).length * TINTS.length} tints for nothing`);
