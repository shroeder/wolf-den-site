// ── THE CASINO FLOOR, DRAWN ──────────────────────────────────────────────────────────────────────────────────
// Every cabinet in the casino is currently a CSS gradient with a border. That was deliberate — the floor plan
// was the thing worth arguing about first, and art costs money to get wrong — but the plan has settled: seven
// machines, all live, in a fixed order along one street. So they get painted.
//
// WHAT MAKES THESE HARD is that they have to read at about 90 pixels wide, in a dark room, in a row, while the
// player is walking past. So every prompt below asks for the same THING — a standing arcade cabinet, seen
// straight on — and varies only what is on its face and what colour it burns. Silhouette variety would look
// livelier in isolation and worse in the row, because the row is what a player actually sees: seven objects
// that are obviously the same kind of object, each obviously a different machine.
//
// The two card tables are the exception and they are supposed to be: a blackjack table and a bingo board are
// not cabinets, and pretending otherwise would make the two games that are not machines look like machines.
//
// Run:  node scripts/gen-casino-art.mjs              # preview, writes local PNGs only
//       node scripts/gen-casino-art.mjs --apply      # write into public/images/casino/
//       node scripts/gen-casino-art.mjs --apply --only=slot,room
import fs from "node:fs";
import path from "node:path";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality, requirePreview } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
// ── PUBLISH WHAT YOU ACTUALLY LOOKED AT ──────────────────────────────────────────────────────────────────────
// The preview-then-apply workflow has a hole in it: --apply GENERATES AGAIN, so the images that ship are not
// the images anybody reviewed. On a contact sheet of nine that is nine fresh rolls of the dice after the
// checking is done, which is most of the value of checking.
//
// --publish skips OpenAI entirely and converts the PNGs already sitting in the preview folder. Look at the
// sheet, then ship exactly that.
const PUBLISH = ARGV.includes("--publish");
const ONLY = (ARGV.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

const OUT = process.env.CASINO_OUT || path.join(process.cwd(), ".casino-art");
const PUBLIC = path.join(process.cwd(), "public", "images", "casino");

// ── THE SHARED BODY IS A SHAPE, NOT A PAINT JOB ──────────────────────────────────────────────────────────────
// Luke: "can you make the slot machine sprites on the floor more indicative of the actual game screen that
// pops up when you play them? And can you make them way more golden and colourful, with variety between the
// different ones so they don't all look the same? Use bold colours so they really pop."
//
// Two faults, and the second one caused the first. This constant used to carry "dark stained wood and
// tarnished brass, wolf-motif carvings" — the MATERIAL was shared, so five machines came out as one machine
// in five faint tints, and the row read as a shop display of the same product. Now the shared part is only
// the SILHOUETTE (upright, plinth, marquee, three reels, a plate below), which is what actually has to match
// so the floor reads as a row of machines. Colour, material and glass belong to each cabinet.
//
// And what is ON the glass had drifted away from the games entirely: The Harvest's cabinet showed "a scatter
// of small coins" when the machine is fruit — lime star fruit, oranges, strawberries — and The Vault's showed
// "a crown" when every symbol on it is a cut gem. You walk up to a cabinet and then sit at it, so the glass
// is a promise about what you are about to see. Each one now shows its own top symbols.
// ── AND THE WHOLE CABINET HAS TO BE INSIDE THE PICTURE ────────────────────────────────────────────────────────
// Every one of the five shipped cabinets was AMPUTATED: the arched marquee ran off the top of the canvas and
// came out sliced flat, which on the floor reads as a machine with its crown cut off. Luke sent two shots of
// it. A contact sheet catches this in seconds and nothing else does -- on the floor each cabinet is about
// ninety pixels tall and the flat top just looks like a design.
//
// The framing instruction is part of the SHARED clause rather than a note on one prompt, because the failure
// was shared: same clause, same silhouette, same mistake five times.
const FRAMING =
    " The ENTIRE cabinet must be inside the frame with clear empty space above the marquee and below the "
    + "plinth -- nothing touching or running off any edge of the image. Centred, whole, with room around it.";

const CABINET =
    "A single free-standing fantasy arcade gambling cabinet seen straight on from the front, upright, taller "
    + "than it is wide, standing on a plinth, with a big glowing glass display of three reels filling the "
    + "upper half, a lit arched marquee across the top and a button plate with a lever below." + FRAMING;

// Gold on every one of them, because he asked for gold on every one of them — and because a gilded frame is
// what makes a saturated body colour read as rich rather than as plastic. Said once so no cabinet forgets it.
const GILT =
    " Heavily gilded: thick polished gold trim around the glass, gold filigree down the sides and a gold-lit "
    + "marquee. Bold saturated colour, jewel-bright, glowing against a dark room — rich and expensive, never "
    + "muted, never washed out, no dull brown anywhere.";

const JOBS = {
    // ── THE COUNTER ── the one thing on this floor that is NOT a cabinet, so it deliberately breaks the
    // shared silhouette above. A cashier's window reads as furniture rather than a game, which is the whole
    // point: it is where you stop playing and spend what you won. Wider than tall, low, and open.
    store: {
        size: "1024x1024",
        prompt: housePrompt(
            "A fantasy casino cashier's counter seen straight on from the front — a low, wide, waist-height "
            + "desk of dark stained wood with a tarnished brass grille above it and a wolf-motif carved into "
            + "the front panel. Neat stacks of gaming chips and a small brass scale sit on the counter top, "
            + "lit by a single hanging lamp. No reels, no lever, no glowing display. Quiet, orderly, closed "
            + "for nobody.",
        ),
    },
    // ── The three slot machines. Same cabinet, three different burns — the volatility of each one made
    // visible, because the player is choosing between them before they read a word.
    slot: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} Deep OXBLOOD RED lacquer panels with hot amber light spilling out of the glass. Its `
            + "three reels show a glowing violet wolf's head on the middle reel, a pale blue crescent moon "
            + "beside it and a heaped orange treasure chest, with a green laurel wreath carved into the "
            + "marquee. Steady, generous, well used — the machine everybody plays."
            + GILT,
        ),
    },
    slot2: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} Squatter and broader than the others, in warm HONEY and crimson lacquer. It is a `
            + "FRUIT machine: its three reels show a vivid lime-green star fruit sliced to a five-pointed "
            + "star, a brilliant orange and a deep crimson strawberry, all glossy and jewel-bright, with a "
            + "blazing amber harvest moon on the marquee and real fruit heaped in the tray at its base. "
            + "Homely, busy, forever paying out a little."
            + GILT,
        ),
    },
    slot3: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} Taller and narrower than the others, in deep ABYSSAL TEAL and blue-black enamel with `
            + "verdigris fittings and barnacles along the plinth. Its three reels glow cold cyan: a violet "
            + "kraken with coiling tentacles on the middle reel, a bright cyan sea-serpent beside it and a "
            + "scarlet crab, with kelp and a ship's lantern worked into the marquee. Austere and expensive — "
            + "the machine you approach rather than sit at."
            + GILT,
        ),
    },
    slot4: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} In warm russet and vivid EMERALD GREEN, its sides carved as a menagerie of beasts.
            Its three reels glow bright green: a blazing golden phoenix with spread wings on the middle reel,
            a glowing mint-green crystal heart beside it and a pale blue spirit fox, with a small brass cage
            of fireflies hanging from one corner and a violet chameleon curled on the marquee. Alive and
            busy — the loudest, most crowded machine on the floor.${GILT}`
                .replace(/\s+/g, " "),
        ),
    },
    slot5: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} The heaviest machine on the floor: a squat armoured strongbox of a cabinet in pale
            BLUED STEEL and gold, with a great riveted vault door built into its lower half and a spoked
            brass handwheel on it. It is a GEM machine: its three reels show a brilliant blue sapphire, a
            blazing red ruby and a vivid green emerald, faceted and throwing hard white glints, with loose
            cut gems spilling from the tray at its base. Expensive, shut, and rarely open.${GILT}`
                .replace(/\s+/g, " "),
        ),
    },

    // ══ THE FREE-SPIN RACK ═══════════════════════════════════════════════════════════════════════
    // Luke: "the info box under the free spins is ghetto and lacking all dopamine and polish."
    //
    // It was: a dark rounded rectangle with three label-over-number stacks in it. Correct information,
    // built out of the vocabulary of a settings panel — and it sits on the glass during the best sixty
    // seconds the machine has, which is the worst possible place to put a form. The Win It Again rack next
    // door is drawn objects in a drawn rack and it reads as part of a cabinet; this is the same problem and
    // gets the same answer. Three pieces, shared by all five machines, tinted by each one's accent.
    // THE RACK ITSELF STAYS CSS, and this is the second time that has been the right answer. I asked for
    // "a long panel with a plain empty recessed middle" and got a red horned demon standing in it — the
    // identical failure the Win It Again note fifty lines up already records ("asking a model for a plate
    // with an empty middle got a goblin standing in it"). A model will not draw an empty rectangle; it will
    // find something to put in it. Brushed metal behind a row of drawn windows is the one part of this a
    // gradient does honestly, so the WINDOWS are sprites and the rack they sit in is CSS.
    "fs-window": {
        size: "1024x1024",
        prompt: housePrompt(
            "A single recessed instrument window seen straight on and flat: a heavy polished GOLD bezel with "
            + "small rivets, set into dark blued metal, with a completely EMPTY black glass panel in the "
            + "centre. Slightly wider than tall. Nothing behind the glass — no digits, no text, no symbols, "
            + "no reflections of objects. Just a bare dark window in a gold frame.",
        ),
    },
    // ══ THE TWO GIANTS ═══════════════════════════════════════════════════════════════════════════
    // Luke, on the reference cabinet: "it has a Lil' Red and a Big Bad Wolf, and they're not repeating tiles,
    // they're actually one big one, and they only show up in the big reels. Those are the best paying ones —
    // the goal is to get them to line up, because that's how you get the massive payout, when you get four or
    // five of the big ones stacked next to each other."
    //
    // So these are drawn TALL and once, at roughly the height of the block they fill, rather than as a tile
    // that repeats down a column. Everything else on this floor is a 1:1 medallion; these two are the only
    // symbols in the building that are a figure, and that is exactly why they read as the prize.
    // ── AND THEY HAVE TO BE THE BRIGHTEST THING IN THE BUILDING ──────────────────────────────────
    // Luke, on the first cut: "those tall ones are kind of weak and not very juicy... I was thinking
    // something more exciting and REGAL and shiny and PRISMATIC, not stale and old like yours. Think about
    // the pop art we want — it needs to be very very dopamine inducing."
    //
    // He is right and it was my fault twice over, in the same way as the Threshing Floor: the house style
    // already asks for "rich saturated jewel-tone colours", and I overrode it in the per-asset line with
    // "deep emerald green, warm brass" and "black and deep crimson fur". A model given a muted palette will
    // give you a muted drawing however bright the house style is. The Keeper came back olive on olive and
    // the wolf came back black on grey — invisible on a dark reel and dead on a bright one.
    //
    // These two are the TOP OF THE PAYTABLE on a machine whose whole pull is lining them up, so they have to
    // out-shine every gem, fruit and coin on the floor. Prismatic and lit from inside, not painted dark.
    "reels/slot4-keeper": {
        size: "1024x1536",
        px: { width: 320, height: 640 },
        prompt: housePrompt(
            "THE KEEPER of a fantasy menagerie: a radiant regal woman standing straight and facing the "
            + "viewer, crowned in gold, wearing flowing IRIDESCENT robes whose colour shifts through cyan, "
            + "magenta and gold like oil on water, gold filigree armour at the shoulders, one hand raised "
            + "holding a blazing white-gold lantern, and a spirit fox of pure white flame curled on her "
            + "shoulder, light pouring off the whole figure",
            { framing: "sprite", extra: "FULL FIGURE head to foot, tall narrow portrait proportions roughly "
                + "one part wide to two tall, seen straight on and flat with no perspective. PRISMATIC and "
                + "BRILLIANT: hot cyan, electric magenta, blazing gold, a rainbow sheen across the robes and "
                + "a hard white specular glint on every gold edge. She GLOWS from within and is the "
                + "brightest, most saturated thing on the machine. Absolutely not muted, not drab, not dark, "
                + "not olive, not dusty, no earth tones anywhere. Nothing else in frame, no background, no "
                + "floor. She must read clearly at 90 pixels wide." }),
    },
    "reels/slot4-dire": {
        size: "1024x1536",
        px: { width: 320, height: 640 },
        prompt: housePrompt(
            "THE DIRE WOLF: an enormous regal wolf standing four-square and facing the viewer, head high and "
            + "proud, its fur an IRIDESCENT aurora shifting through electric violet, hot cyan and magenta "
            + "with a prismatic rainbow sheen along every strand, eyes blazing molten gold, wearing a heavy "
            + "gold-and-gemstone collar, ribbons of coloured light crackling off its ruff",
            { framing: "sprite", extra: "FULL BODY head to paws, tall narrow portrait proportions roughly one "
                + "part wide to two tall, filling the frame top to bottom, seen straight on and flat with no "
                + "perspective. PRISMATIC and BRILLIANT: electric violet, hot cyan and magenta fur with a "
                + "rainbow oil-slick sheen, molten gold eyes, blazing gold collar set with vivid gems. It "
                + "GLOWS from within and is the brightest, most saturated thing on the machine. Absolutely "
                + "not black, not grey, not muted, not drab, no dull earth tones anywhere. Nothing else in "
                + "frame, no background, no floor. It must read clearly at 90 pixels wide." }),
    },

    // ── THE WILD IS A WORD, NOT AN ANIMAL ────────────────────────────────────────────────────────────
    // Luke: "I'm hoping for this one we could have a wild sprite that isn't the iguana — instead it's the
    // actual word WILD in rainbow or something."
    //
    // Which is what a real cabinet does, and for a reason worth saying: the wild is the only symbol whose
    // job is not to be itself. Every other tile is a thing you are collecting; the wild is a RULE. Drawing
    // it as one more animal puts it in the same category as the things it substitutes for, and on a board
    // where a fifth of the tiles are wild that is a board that looks like it is mostly chameleons.
    "reels/slot4-wolf": {
        size: "1024x1024",
        prompt: housePrompt(
            "The single word WILD in bold chunky capital letters, filling the frame, the letters cut from "
            + "polished iridescent metal that shifts through magenta, cyan, violet and gold like an oil "
            + "slick, with a heavy bevelled gold outline around every letter and small sparks of light "
            + "coming off the corners",
            { framing: "sprite", extra: "The word WILD and nothing else — four letters, W I L D, spelled "
                + "correctly, in one straight horizontal line, seen straight on and flat. Bold heavy display "
                + "lettering, very thick strokes, filling the width of the frame. PRISMATIC rainbow metal "
                + "with a hard gold bevel. It must read at 40 pixels wide, so the letters must be chunky and "
                + "widely spaced. Nothing else in frame — no animal, no border, no plate, no background." }),
    },
    // ── THE TWO NUMBERS IN THE HEADER ────────────────────────────────────────────────────────────────
    // Luke: "just show the coin amount with the coin sprite and the chip amount with the chip sprite... that
    // way we can free up that entire row." Two tiny icons buy back a whole strip of the screen.
    "hud-coin": {
        size: "1024x1024",
        prompt: housePrompt(
            "A single thick gold coin seen face on, a wolf's head stamped in relief on it, milled edge, "
            + "polished and catching one hard highlight",
            { framing: "sprite", extra: "Hot polished gold. Perfectly circular, seen straight on and flat. "
                + "Must read at 18 pixels wide — chunky, almost no fine detail. Nothing else in frame." }),
    },
    "hud-chip": {
        size: "1024x1024",
        prompt: housePrompt(
            "A single casino gaming chip seen face on, deep emerald green with cream edge spots around its "
            + "rim and a small gold wolf's head in the middle",
            { framing: "sprite", extra: "Vivid emerald green and cream with a gold centre. Perfectly "
                + "circular, seen straight on and flat. Must read at 18 pixels wide — chunky, almost no fine "
                + "detail. Nothing else in frame." }),
    },

    "fs-mult": {
        size: "1024x1024",
        prompt: housePrompt(
            "A round polished GOLD medallion seen straight on and flat, its rim milled with fine teeth like "
            + "a coin edge and studded with small gems, with a completely EMPTY recessed dark centre that "
            + "glows faintly from within. Perfectly circular. Nothing struck into the middle — no digits, no "
            + "text, no letters, no symbols at all.",
        ),
    },

    // ── THE ROOM DRESSING ────────────────────────────────────────────────────────────────────────
    // Nine cabinets in a row is a shop display. These are what make it a floor: things standing between
    // the machines that nobody can play. They are drawn to the SAME rules as the cabinets — straight on,
    // flat, no ground shadow of their own (the CSS adds one, and a baked shadow would double up) —
    // because they are composited into the same row and any one of them looking three-quarter-on is the
    // thing that gives the whole room away as a collage.
    decor_plant: {
        size: "1024x1024",
        prompt: housePrompt(
            "A tall potted fan palm in a heavy tarnished brass urn, seen straight on from the front, flat "
            + "elevation, standing upright. Dark green fronds, a little overgrown.",
            { extra: "It must read at 46 pixels wide: bold silhouette, no fine detail, no cast shadow, no floor." },
        ),
    },
    decor_rope: {
        size: "1024x1024",
        prompt: housePrompt(
            "A pair of short brass stanchions with a swag of deep VIOLET velvet rope hanging between them, "
            + "seen straight on from the front, flat elevation. Wider than it is tall.",
            { extra: "It must read at 46 pixels wide: bold silhouette, no fine detail, no cast shadow, no floor." },
        ),
    },
    decor_stool: {
        size: "1024x1024",
        prompt: housePrompt(
            "A single tall padded gaming stool, seen straight on from the front, flat elevation: dark wood "
            + "legs with a brass footrail and a round seat in deep red buttoned leather.",
            { extra: "It must read at 46 pixels wide: bold silhouette, no fine detail, no cast shadow, no floor." },
        ),
    },
    // The lamps. These hang from the top of the room and the CSS throws a cone of light down from each, so
    // the sprite has to be lit from WITHIN and have nothing above it — a chain that fades out, not a
    // ceiling, because there is no ceiling in the picture for it to be attached to.
    decor_lamp: {
        size: "1024x1024",
        prompt: housePrompt(
            "A small ornate hanging chandelier of tarnished brass and violet glass, lit warm gold from "
            + "within, hanging on a short chain, seen straight on from the front in flat elevation. The "
            + "chain runs off the top edge of the frame. No ceiling.",
            { extra: "It must read at 46 pixels wide: bold silhouette, no fine detail, no cast shadow." },
        ),
    },

    // ── The wheel and the ticket board.
    roulette: {
        size: "1024x1024",
        prompt: housePrompt(
            "A fantasy roulette wheel standing upright in a heavy carved wooden frame, seen straight on from "
            + "the front. The wheel face is divided into alternating GOLD and VIOLET pockets with two wolf-head "
            + "pockets, a brass ball track around its rim and a pointer at the top.",
        ),
    },
    keno: {
        size: "1024x1024",
        prompt: housePrompt(
            "A tall fantasy keno board standing upright on a plinth, seen straight on from the front: a dark "
            + "slate grid of small round numbered lamps in a brass frame, a scattering of them lit warm gold, "
            + "and a glass sphere of numbered balls mounted at the top.",
        ),
    },
    // ── The two that are NOT machines, and must not look like machines.
    bingo: {
        size: "1024x1024",
        prompt: housePrompt(
            "A fantasy bingo caller's stand seen straight on from the front: a brass cage of numbered wooden "
            + "balls turning on a crank, mounted above a small dark-wood lectern with a green baize top and a "
            + "single bingo card resting on it.",
        ),
    },
    blackjack: {
        size: "1024x1024",
        prompt: housePrompt(
            "A fantasy blackjack table seen from the front and slightly above: a half-circular table with deep "
            + "GREEN baize, a curved brass rail, a fan of playing cards face down on the felt and a small stack "
            + "of gold coins beside them. Empty — no people, no hands, no dealer.",
        ),
    },
    // ── The room they stand in. A scene, not an object — and a FLAT one.
    //
    // The first attempt was a gorgeous one-point-perspective hall receding to a vanishing point at the centre
    // of the frame. It was also useless: this floor SCROLLS SIDEWAYS, and a vanishing point is only correct
    // from one camera position. Pan two machines to the right and the whole room is looking the wrong way.
    //
    // So this asks for a flat elevation — a wall seen dead-on, parallel to the picture plane, the way a stage
    // backdrop or a side-scrolling game's background is drawn. Nothing recedes, so nothing can be wrong from
    // anywhere along it. And the floor stays empty, because seven cabinets get composited on top of it.
    room: {
        size: "1536x1024",
        prompt: housePrompt(
            "The back wall of a lavish fantasy casino hall at night, seen DEAD-ON in flat side elevation "
            + "with NO perspective and NO vanishing point — the wall runs exactly parallel to the picture "
            + "plane, like a theatre backdrop or the background of a side-scrolling game. An arcade of "
            + "tall gold-framed arches in deep violet panelling, and THROUGH each arch a glimpse of a "
            + "darker second hall behind, so the wall has real depth in it rather than being one flat "
            + "plane. Heavy draped crimson curtains between the arches, warm gold wall lamps at even "
            + "spacing all the way across each throwing a visible pool of light on the panelling, gilded "
            + "wolf-head medallions above the arch keystones, and a rich patterned carpet in violet and "
            + "gold along the bottom. Completely empty: no tables, no machines, no furniture, no people.",
            {
                framing: "scene",
                extra: "The composition must be evenly weighted from left to right with no centre of focus, "
                    + "because the camera pans across it — anything that draws the eye to one spot is wrong.",
            },
        ),
    },
    // ── THE PIGGY BANKS ── three of them, and they must read as a SET at a glance: same pose, same
    // silhouette, three metals. They are drawn EMPTY and get bigger on screen as they fill (a CSS scale off
    // the fill fraction), which is why the pose has to be the same in all three — a set that changes shape
    // between tiers cannot be scaled without looking like three different objects.
    bank_copper: {
        size: "1024x1024",
        prompt: housePrompt(
            "A plump fantasy piggy bank made of hammered COPPER, seen straight on from the side, standing "
            + "square, with a coin slot on its back and small sturdy feet. Warm reddish-brown metal, a little "
            + "tarnished.",
            { extra: "It must read at 64 pixels: one object, bold silhouette, no fine detail, no coins around it." },
        ),
    },
    bank_silver: {
        size: "1024x1024",
        prompt: housePrompt(
            "A plump fantasy piggy bank made of polished SILVER, seen straight on from the side, standing "
            + "square, with a coin slot on its back and small sturdy feet. Cool bright metal with cold blue "
            + "highlights. IDENTICAL POSE AND SHAPE to a copper one — only the metal differs.",
            { extra: "It must read at 64 pixels: one object, bold silhouette, no fine detail, no coins around it." },
        ),
    },
    bank_gold: {
        size: "1024x1024",
        prompt: housePrompt(
            "A plump fantasy piggy bank made of solid GOLD, seen straight on from the side, standing square, "
            + "with a coin slot on its back and small sturdy feet. Rich warm gold, glowing faintly. IDENTICAL "
            + "POSE AND SHAPE to a copper one — only the metal differs.",
            { extra: "It must read at 64 pixels: one object, bold silhouette, no fine detail, no coins around it." },
        ),
    },

    // ── The icon. One image, used on the town street and on the bounty card.
    icon: {
        size: "1024x1024",
        prompt: housePrompt(
            "A single fantasy casino token: a thick round gold-and-violet gaming chip stamped with a howling "
            + "wolf's head, seen straight on, face-on to the viewer.",
            { extra: "It must read instantly at 24 pixels wide: one object, bold shapes, high contrast, no fine detail." },
        ),
    },
};

const names = (ONLY.length ? ONLY : Object.keys(JOBS)).filter((k) => JOBS[k]);
if (!names.length) { console.error("nothing to draw"); process.exit(1); }

// Priced by size, because the room is a wide image and costs half again what a square one does.
let bill = 0;
for (const size of new Set(names.map((n) => JOBS[n].size))) {
    const count = names.filter((n) => JOBS[n].size === size).length;
    bill += priceRun({ count, size, quality: Q });
}
if (PUBLISH) console.log(`publishing ${names.length} existing preview(s) — no OpenAI calls, $0.00`);
else {
    console.log(`${names.length} image(s), $${bill.toFixed(2)} total${APPLY ? "" : " — PREVIEW ONLY, nothing written to public/"}`);
    if (APPLY) requirePreview({ count: names.length, total: bill });
}

fs.mkdirSync(OUT, { recursive: true });
if (APPLY || PUBLISH) fs.mkdirSync(PUBLIC, { recursive: true });

async function generate(job) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
                body: JSON.stringify({
                    model: "gpt-image-1",
                    prompt: job.prompt,
                    size: job.size,
                    // The room is a SCENE and must fill its frame; everything else is composited into a dark
                    // room and needs its background gone.
                    background: job.size === "1536x1024" ? "opaque" : "transparent",
                    output_format: "png",
                    quality: Q,
                    n: 1,
                }),
            });
            if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
            const b64 = (await resp.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((r) => setTimeout(r, 4000 * attempt));
        }
    }
    return null;
}

const sharp = (await import("sharp")).default;
const queue = [...names];
const failed = [];
let done = 0;

await Promise.all(Array.from({ length: 3 }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
        const job = JOBS[name];
        try {
            let buf;
            if (PUBLISH) {
                const src = path.join(OUT, `${name.replace(/\//g, "__")}.png`);
                if (!fs.existsSync(src)) throw new Error(`no preview at ${src} — generate it first`);
                buf = fs.readFileSync(src);
            } else {
                buf = await generate(job);
                fs.writeFileSync(path.join(OUT, `${name.replace(/\//g, "__")}.png`), buf);
            }
            if (APPLY || PUBLISH) {
                // webp at the size it is actually drawn at. The cabinets render about 90px wide and the room
                // about 900 — shipping 1024px PNGs of either would be several megabytes of a page that has to
                // open on a phone in a shop.
                // The room is sized by HEIGHT, not width. It is mirror-tiled to 3:1 before publishing (see
                // the note on the wall), and a width cap on a 3:1 image throws away two thirds of its
                // vertical resolution — the wall came out 427px tall for a room that draws it at 320.
                const wide = job.size === "1536x1024";
                // `px` for the jobs that are neither square nor a wall — the two giants are 1:2 figures and a
                // square cap would have thrown away half of each of them.
                const box = job.px || (wide ? { height: 620 } : { width: 384, height: 384 });
                const webp = await sharp(buf)
                    .resize({ ...box, fit: "inside" })
                    .webp({ quality: 88 })
                    .toBuffer();
                // A name may carry a subdirectory (reels/slot4-dire); make it rather than throwing on write.
                const dest = path.join(PUBLIC, `${name}.webp`);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, webp);
            }
            done += 1;
            console.log(`✓ ${name.padEnd(10)} ${(buf.length / 1024).toFixed(0)}KB`);
        } catch (e) {
            failed.push(name);
            console.log(`✗ ${name}: ${e.message}`);
        }
    }
}));

console.log(`\n${done}/${names.length} drawn${failed.length ? ` — failed: ${failed.join(", ")}` : ""}`);
console.log(`previews: ${OUT}${APPLY ? `\npublished: ${PUBLIC}` : ""}`);
