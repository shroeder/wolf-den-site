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

// The shared body of every cabinet. Written once because the ROW is the design: seven machines that are
// plainly the same kind of furniture, differing in what they do rather than in what shape they are.
const CABINET =
    "A single free-standing fantasy arcade gambling cabinet seen straight on from the front, upright, taller "
    + "than it is wide, standing on a plinth. Dark stained wood and tarnished brass, wolf-motif carvings, a "
    + "glowing display panel in the upper half and a lever or button plate below.";

const JOBS = {
    // ── The three slot machines. Same cabinet, three different burns — the volatility of each one made
    // visible, because the player is choosing between them before they read a word.
    slot: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} Its display shows three reels lit warm GOLD, a howling wolf's head glowing on the middle `
            + "reel. Steady, generous, well-used — the machine everybody plays.",
        ),
    },
    slot2: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} Squatter and broader than the others, in worn honey-coloured wood with copper fittings. `
            + "Its display shows three reels lit soft AMBER, a scatter of small coins spilling from the tray at "
            + "its base. Homely, busy, forever paying out a little.",
        ),
    },
    slot3: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} Taller and narrower than the others, in near-black wood with silver fittings. Its display `
            + "shows three reels lit cold VIOLET and pale blue, a crescent moon and scattered stars glowing on "
            + "them. Austere and expensive-looking — the machine you approach rather than sit at.",
        ),
    },
    slot4: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} In warm russet wood with brass fittings, its cabinet sides carved as a menagerie of
            beasts. Its display shows three reels lit deep GREEN, a wolf pup and a griffin glowing on them,
            and a small brass cage of fireflies hanging from one corner. Alive and busy.`
                .replace(/\s+/g, " "),
        ),
    },
    slot5: {
        size: "1024x1024",
        prompt: housePrompt(
            `${CABINET} The heaviest machine on the floor: a squat armoured strongbox of a cabinet in blued
            steel and gold, with a great riveted vault door built into its lower half and a spoked brass
            handwheel on it. Its display shows three reels lit hard WHITE and gold, a crown glowing on the
            middle one. Expensive, shut, and rarely open.`
                .replace(/\s+/g, " "),
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
                const src = path.join(OUT, `${name}.png`);
                if (!fs.existsSync(src)) throw new Error(`no preview at ${src} — generate it first`);
                buf = fs.readFileSync(src);
            } else {
                buf = await generate(job);
                fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
            }
            if (APPLY || PUBLISH) {
                // webp at the size it is actually drawn at. The cabinets render about 90px wide and the room
                // about 900 — shipping 1024px PNGs of either would be several megabytes of a page that has to
                // open on a phone in a shop.
                // The room is sized by HEIGHT, not width. It is mirror-tiled to 3:1 before publishing (see
                // the note on the wall), and a width cap on a 3:1 image throws away two thirds of its
                // vertical resolution — the wall came out 427px tall for a room that draws it at 320.
                const wide = job.size === "1536x1024";
                const webp = await sharp(buf)
                    .resize(wide ? { height: 620, fit: "inside" } : { width: 384, height: 384, fit: "inside" })
                    .webp({ quality: 88 })
                    .toBuffer();
                fs.writeFileSync(path.join(PUBLIC, `${name}.webp`), webp);
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
