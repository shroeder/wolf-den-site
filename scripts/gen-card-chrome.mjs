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
const INK = "⚠️ SIMPLE. Drawn as a CHUNKY PICTOGRAM with a thick brush in solid black ink: a bold silhouette with VERY FEW internal details, rounded friendly shapes, and slightly rough uneven brush edges as if stamped by hand. NO shading, no cross-hatching, no engraving lines, no texture, no outline, no colour, no background — flat black shapes and clean empty gaps, nothing else. It must read instantly at the size of a fingernail. Centred, filling the frame, a little empty space around it.";

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
    // ── THE MAP'S ROOM MARKS ─────────────────────────────────────────────────────────────────────────────
    // Luke: "the key difference between us and them is that they have actual sprites." He is right — the
    // map was drawing react-icons glyphs, which are UI icons: even stroke weight, designed to sit in a
    // toolbar. Theirs are MAP INK, stamped symbols with the weight and the wobble of something drawn onto
    // a chart, and that difference is most of why their sheet reads as a map and ours read as a diagram.
    //
    // Flat black on transparency so the paper shows through and one file serves every state — faint,
    // reachable and visited are opacity and rings in CSS, not three drawings.
    "map-fight": {
        size: "1024x1024", store: { w: 160, h: 160 }, tint: false, extra: INK,
        subject: "A simple round monster face seen head-on: two small curved horns on top, two eyes and a wide grinning mouth. Almost a mask. No nose, no ears, no hair, no neck.",
    },
    "map-elite": {
        size: "1024x1024", store: { w: 160, h: 160 }, tint: false, extra: INK,
        subject: "A simple horned SKULL face seen head-on: two big curved horns, two round empty eye sockets and a row of square teeth. The same simple mask shape as the monster face but broader and bonier.",
    },
    "map-rest": {
        size: "1024x1024", store: { w: 160, h: 160 }, tint: false, extra: INK,
        subject: "A simple campfire: two crossed logs with one rounded flame above them. Three shapes in total.",
    },
    "map-merchant": {
        size: "1024x1024", store: { w: 160, h: 160 }, tint: false, extra: INK,
        subject: "A simple round money pouch with a knotted neck and a coin symbol on its belly. One shape.",
    },
    "map-treasure": {
        size: "1024x1024", store: { w: 160, h: 160 }, tint: false, extra: INK,
        subject: "A simple closed treasure chest seen straight on: a wide rounded box, one band across the middle and a diamond shape at its centre.",
    },
    "map-boss": {
        size: "1024x1024", store: { w: 160, h: 160 }, tint: false, extra: INK,
        subject: "A simple skull face seen head-on wearing a small pointed crown: two round eye sockets, square teeth, three crown points. Nothing else.",
    },
    // ── THE REST OF WHAT THEIR MAP SCREEN IS MADE OF ─────────────────────────────────────────────────────
    // Luke: "we need to generate sprites where they use sprites... why did you invent a return? They use a
    // sprite, that red sprite looking thing." Every one of these was CSS pretending to be art.
    "map-visited": {
        size: "1024x1024", store: { w: 200, h: 200 }, tint: false, extra: INK,
        subject: "A rough hand-drawn CIRCLE, a single thick brush ring with the two ends not quite meeting and "
            + "the stroke thick and thin along its length. Completely EMPTY inside — just the ring.",
    },
    "ui-heart": {
        size: "1024x1024", store: { w: 120, h: 120 }, tint: false, extra: SOLID,
        subject: "A plump glossy red heart seen straight on, painted with a soft highlight at the top left and "
            + "a darker crimson at the base. Rounded and friendly, no outline.",
    },
    "ui-floor": {
        size: "1024x1024", store: { w: 120, h: 120 }, tint: false, extra: SOLID,
        subject: "A small flight of STAIRS seen from the side, three steps rising to the right, drawn as a "
            + "solid pale stone block shape. Simple and flat.",
    },
    "ui-potion": {
        size: "1024x1024", store: { w: 120, h: 120 }, tint: false, extra: SOLID,
        subject: "A small round-bellied glass potion bottle with a short neck and a cork, filled with bright "
            + "liquid and a soft highlight down one side.",
    },
    // The legend is a pinned scroll on their screen, not a rounded div.
    "legend-scroll": {
        size: "1024x1536", store: { w: 420, h: 630 }, tint: false, extra: SOLID,
        subject: "A pale blue-white parchment scroll hanging flat, its top and bottom edges ROLLED into neat "
            + "curls and the sheet between them smooth, blank and empty. Soft painted paper, cool white-blue, "
            + "faint shading where it curls. Nothing written on it.",
    },
    // And the Return ribbon, bottom left, which was a CSS pill.
    "return-ribbon": {
        size: "1536x1024", store: { w: 420, h: 150 }, tint: false, extra: SOLID,
        subject: "A deep red cloth ribbon banner running horizontally, its RIGHT end tapering to a notched "
            + "swallow-tail point and its left end running flat off the edge. Smooth painted fabric with a "
            + "soft fold shadow, a thin darker red hem, and nothing written on it.",
    },
    "ui-ember": {
        size: "1024x1024", store: { w: 120, h: 120 }, tint: false, extra: SOLID,
        subject: "A single bright ember flame, teardrop shaped, glowing orange at its heart and fading to a "
            + "deeper red at the edges, with a soft warm glow. Simple and rounded, no logs, no smoke.",
    },
    "ui-mapbook": {
        size: "1024x1024", store: { w: 120, h: 120 }, tint: false, extra: SOLID,
        subject: "A small rolled paper map seen at a slight angle, tied with a red cord, its edges curling. "
            + "Warm parchment against nothing.",
    },
    "ui-deckbook": {
        size: "1024x1024", store: { w: 120, h: 120 }, tint: false, extra: SOLID,
        subject: "A neat stack of playing cards seen at a slight angle, the top card face down showing a dark "
            + "blue back with a pale border. Simple and solid.",
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

    // ── THE MERCHANT'S ROOM ──────────────────────────────────────────────────────────────────────────────
    // Luke: "the merchant looks nothing like it, it doesn't Slay the Spire."
    //
    // He is right, and it is the same fault the map had and the reward screen had, one room later: THE SCREEN
    // WAS CSS. A gradient, a flex bar, three bordered buttons with the card's NAME TYPED INTO THEM, and a
    // rectangle around the removal. Theirs is a PLACE — a stall under a slung awning with somebody standing
    // behind it, the cards laid out as cards, the potions as bottles, the purge as a fire you feed — and the
    // gap between the two is not styling. Theirs has THINGS in it and ours had text about things.
    //
    // ⚠️ THE ROOM MUST NOT COMPETE WITH THE WARES. Everything drawn here is the BACKGROUND of a screen whose
    // whole job is comparing three cards against a price, so it is deliberately dim, warm and low contrast:
    // the brightest thing on this screen has to be the card you are deciding about, never the wallpaper
    // behind it. That is why the room is asked for as lantern-lit gloom rather than as a lit scene, and it is
    // the one instruction to keep if these are ever redrawn.
    "shop-room": {
        size: "1536x1024", store: { w: 900, h: 600 }, tint: false, opaque: true, framing: "scene",
        extra: "DIM and LOW CONTRAST — the whole image sits in the dark half of the value range, lit by one "
            + "warm lantern, with the corners and edges falling away into near-black shadow. Nothing bright, "
            + "nothing white, no strong focal point, no character, no creature, no merchandise, no stall and "
            + "nothing in the foreground: this is only the empty room behind everything else. Softly out of "
            + "focus, as though seen past the thing that actually matters.",
        subject: "The inside of a dark stone alcove beside a mountain road at night: rough dry-stone walls, a "
            + "heavy timber beam across the top, a worn flagstone floor, and one hanging brass lantern "
            + "throwing warm amber light onto the stones. Deep cool shadow everywhere the lantern does not "
            + "reach.",
    },
    // THE THING HE ACTUALLY ASKED FOR. Their merchant is most of why their shop reads as a shop rather than as
    // an inventory screen: a person is standing there and you are buying from HIM. Ours had nobody in it.
    //
    // Arms OPEN OVER THE WARES rather than at his sides, because the pose has to say "these are mine and they
    // are for sale" from a silhouette 200px tall — and looking slightly down and to his right, which is where
    // the shelf goes, so he is looking at the thing you are looking at.
    "shop-keeper": {
        fit: "inside", size: "1024x1536", store: { w: 460, h: 690 }, tint: false,
        subject: "A hunched, welcoming travelling MERCHANT standing behind his stall, seen from the front from "
            + "the knees up: a lean fox-faced trader with a long muzzle, warm amber eyes and one notched ear, "
            + "grinning slyly. He wears a deep hood pushed back off his head, a heavy patched travelling cloak "
            + "with a thick fur collar, fingerless gloves, and a wide leather belt strung with little brass "
            + "trinkets, keys, vials and coin pouches. BOTH ARMS ARE SPREAD WIDE AND LOW, palms turned up and "
            + "open, presenting his wares to the viewer. He is turned very slightly to his right and looking "
            + "gently DOWNWARD, as though at the goods laid out in front of him. Warm lantern light on his "
            + "face and shoulders, cool shadow down his back.",
    },
    // The awning is what turns a shelf into a STALL. Its scallops and its sag are the detail; the middle is
    // plain canvas, so border-image can stretch it to any width without smearing the ends.
    "shop-awning": {
        size: "1536x1024", store: { w: 1000, h: 280 }, tint: false,
        extra: "Drawn FLAT ON, straight from the front, symmetrical left to right, with NO perspective and no "
            + "tilt. The awning itself is SOLID and opaque; everything around it, and everything BELOW its "
            + "hanging edge, is fully transparent. It spans the full width of the image and is centred, with a "
            + "little empty space above it.",
        subject: "A slung market-stall AWNING seen head on: a heavy sagging canvas roof in faded red and cream "
            + "stripes, hung from a rough timber pole that runs the whole width, its lower edge cut into deep "
            + "scalloped points with a frayed hem. The canvas is worn, patched and stained, and it dips "
            + "slightly in the middle under its own weight. Nothing hangs from it and there is nothing "
            + "underneath it.",
    },
    // The wares stand ON something or they float. A plank, drawn to be stretched: the brackets are at the ends
    // and the span between them is plain wood.
    "shop-shelf": {
        size: "1536x1024", store: { w: 1000, h: 150 }, tint: false,
        extra: "Drawn FLAT ON, straight from the front, symmetrical left to right, with NO perspective, no "
            + "tilt and NO top surface visible — only the front edge of the plank and its brackets. Solid and "
            + "opaque, everything around it fully transparent. It spans the full width of the image.",
        subject: "A heavy weathered oak SHELF plank seen edge on from the front, its grain deep and its front "
            + "edge chipped, carried at each end by a small blackened iron bracket with a rivet. The span "
            + "between the two brackets is plain unbroken timber with nothing on it, nothing carved into it "
            + "and nothing hanging from it.",
    },
    // ── THE PURGE ────────────────────────────────────────────────────────────────────────────────────────
    // Removing a card is the only reason a shop exists (see SHOP in cards-kit) and it was a bordered div with
    // a heading in it — the quietest thing on the screen where it should be the loudest. Theirs is a big lit
    // object you walk up to. So is this one: a brazier, and you feed a card to it.
    "shop-brazier": {
        fit: "inside", size: "1024x1024", store: { w: 320, h: 320 }, tint: false,
        subject: "A squat blackened iron BRAZIER on three clawed feet, its shallow bowl heaped with glowing "
            + "orange coals and a single tall curling flame rising from the centre, throwing warm light up "
            + "onto its own rim. A few sparks drift above it. Heavy, forged and battered.",
    },
    // One thing on the shelf cannot be got anywhere else, and a plinth is how a shop says so.
    "shop-plinth": {
        fit: "inside", size: "1024x1024", store: { w: 260, h: 260 }, tint: false,
        subject: "A small square stone PEDESTAL seen straight on from the front, its top a plain flat slab and "
            + "its base moulded, carved from pale weathered granite with a thin band of tarnished brass around "
            + "the neck. Completely bare — nothing standing on it, nothing carved into its face.",
    },
    // A price has to sit ON something or it is a number floating over a painting. Small enough that three of
    // them in a row do not become the loudest thing on the shelf.
    "shop-tag": {
        size: "1024x1024", store: { w: 200, h: 130 }, tint: false, extra: SOLID,
        subject: "A small blank hanging PRICE TAG: a rounded rectangle of scuffed dark leather with a stitched "
            + "edge and a brass eyelet punched through its top, seen straight on. Its face is completely "
            + "empty — no writing, no number, no emblem, nothing struck into it.",
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
    const prompt = housePrompt(piece.subject, { framing: piece.framing || "sprite", extra: piece.extra || CHROME });
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
        // ⚠️ fit MATTERS ONCE A PIECE HAS PROPORTIONS. Everything here used to be furniture that gets
        // stretched to whatever box it lands in, so "fill" was right and the aspect was nobody's business.
        // A drawn CHARACTER is not that: trim() cuts the transparent margin off first, which changes the
        // aspect by however much margin the model happened to leave, and filling a fixed box after that
        // squashes him by an amount that varies per generation. Objects that are a shape rather than a
        // texture ask for "inside" and keep it.
        .resize(piece.store.w, piece.store.h, { fit: piece.fit || "fill" })
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
