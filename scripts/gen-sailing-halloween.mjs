// THE HALLOWEEN SEA, AS REAL SPRITES.
//
// Run:  node scripts/gen-sailing-halloween.mjs [--force] [--only bat-up,serpent]
//
// ⚠️ THIS REPLACES react-icons GLYPHS, WHICH WERE THE WRONG ANSWER. The first pass dressed the sea with
// GiBat, GiPumpkinLantern, GiWitchFlight and friends — flat monochrome vector glyphs, the same weight and the
// same single colour, pasted over painted cel-shaded art. Luke: "we don't like all the cheap icons, and it
// looks really cheap... you have bats that just don't even move and they look like they don't even look like
// sprites. What were you thinking? Don't you know the rule is to always use sprites?"
//
// He is right and it is a standing rule. A glyph cannot hold the house style: no rim light, no palette, no
// volume, and nothing to animate — a single path either sits still or slides.
//
// ⚠️ THE BAT IS TWO FRAMES. A sprite that translates across the screen without changing shape reads as a
// sticker being dragged, which is exactly the complaint. Wings-up and wings-down alternated on a steps()
// animation is what makes it fly rather than move.
//
// COST: eight images at gpt-image-1 `medium` — roughly $0.35 the whole run. Nothing here is a hero asset the
// player inspects; they are 20-60px objects crossing a dark sea, and `high` would be spending on detail the
// screen cannot show. See the house rule on art spend.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/hw";
fs.mkdirSync(OUT, { recursive: true });
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.includes("--only")
    ? String(process.argv[process.argv.indexOf("--only") + 1] || "").split(",").map((x) => x.trim()).filter(Boolean)
    : null;

// Lifted from the sailing art so these belong to the same game: the boats, the encounters and the horizons are
// all "cartoon mobile game, painterly cel-shaded, bold shapes, rich saturated colour".
const STYLE =
    "Cartoon mobile-game sprite, painterly CEL-SHADED style with bold clean shapes, rich saturated colour, "
    + "strong readable silhouette, soft rim light along one edge so it reads against a dark night sea. "
    + "Slightly stylised and characterful rather than photo-real.";

// ⚠️ THE CUTOUT RULES ARE NOT OPTIONAL. Without them gpt-image-1 returns a scene with ground and a cast
// shadow, or a sticker with a white rim, and both are instantly obvious over painted art.
const CUTOUT =
    "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — "
    + "roughly 12% of the image empty above, below, left and right. NO part of the object may touch or run "
    + "off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY "
    + "TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO water, NO ground, NO "
    + "cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it. "
    + "No text, no words, no letters, no logo, no watermark, no border.";

const SPRITES = [
    // ── THE SKY ──────────────────────────────────────────────────────────────────────────────────────────
    // Two frames of the same bat, same size and same pose, differing ONLY in the wings — anything else that
    // moves between frames reads as a flicker rather than a flap.
    ["bat-up", 512,
        "A single cartoon vampire bat seen from BEHIND and slightly above, flying away from the viewer, with "
        + "its WINGS RAISED HIGH above its body at the top of a wingbeat, wing membranes spread and angular. "
        + "Dark charcoal-purple fur with a faint cold moonlight rim along the top edges of the wings. Small "
        + "body, large wings, clearly a bat in silhouette."],
    // ⚠️ THE TWO FRAMES MUST BE THE SAME ANIMAL. The first attempt described each independently and came back
    // with a dark purple bat and a pale grey-brown one — alternating those is a flicker between two
    // creatures, not a wingbeat. The colour, the fur and the body are now pinned in both prompts in the same
    // words, and only the wing clause differs.
    ["bat-down", 512,
        "A single cartoon vampire bat seen from BEHIND and slightly above, flying away from the viewer, with "
        + "its WINGS SWEPT DOWN and forward below the body at the bottom of a wingbeat, membranes stretched "
        + "wide and angular. DARK CHARCOAL-PURPLE fur and DEEP BLUE-VIOLET wing membranes — a dark night-"
        + "coloured bat, definitely NOT grey, NOT brown, NOT pale. Faint cold blue moonlight rim along the "
        + "top edges of the wings. Small round dark body, large wings."],
    ["witch", 640,
        "A witch in a tattered black robe and a tall pointed hat riding a broomstick, seen from the SIDE, "
        + "flying to the left, robe and hat brim streaming behind her in the wind. Mostly a dark silhouette "
        + "with a thin sickly-green rim light along her back and the broom handle, as if lit from behind by a "
        + "moon. Sinister but stylised, not gory."],
    ["ghost", 512,
        "A spectral ghost drifting in the air: a hollow-eyed pale figure whose lower body dissolves into "
        + "wispy trailing vapour, semi-transparent, glowing faint sickly green-white from within. Eerie and "
        + "unsettling, cartoon-stylised, not gory and not comedic."],

    // ── THE WATER ────────────────────────────────────────────────────────────────────────────────────────
    // The "real scary thing" — big, and the only object here with actual menace.
    ["serpent", 768,
        "A huge sea serpent's neck and head RISING out of water, seen from the side, mouth slightly open "
        + "showing teeth, eyes glowing sickly green. Dark slick blue-green scales with a wet sheen and a cold "
        + "rim light along the spine, tattered fins along the neck. Menacing and dramatic. Draw ONLY the "
        + "creature itself with a clean bottom edge where it would meet the waterline — no water, no splash, "
        + "no spray, no waves."],
    ["tentacle", 640,
        "A single enormous kraken tentacle rising and curling out of water, seen from the side, thick at the "
        + "bottom and tapering to a curled tip, rows of pale suckers along its inner face. Dark violet-black "
        + "slick skin with a cold green rim light down one edge. Draw ONLY the tentacle with a clean bottom "
        + "edge where it would meet the waterline — no water, no splash, no spray, no waves."],
    ["pumpkin", 512,
        "A carved jack-o'-lantern floating upright in water, seen from slightly above the waterline, its "
        + "triangular eyes and jagged grin glowing hot orange from a candle inside, casting warm light on the "
        + "ridges of its own rind. Weathered and a little waterlogged. Draw ONLY the pumpkin with a clean "
        + "flat bottom edge where the waterline would cut it — no water, no reflection, no ripples, and "
        + "ABSOLUTELY NO dark shadow ellipse or smudge beneath it. Nothing at all below the pumpkin."],
    ["skull", 448,
        "A weathered bleached human skull floating in water, tilted at a slight angle, seen from the front "
        + "and slightly above, empty eye sockets in deep shadow, a few cracks and barnacle marks. Bone-white "
        + "with cold blue-green shadows. Draw ONLY the skull with a clean flat bottom edge where the "
        + "waterline would cut it — no water, no reflection, no ripples."],
];

async function makeOne(name, size, subject) {
    const file = `${OUT}/${name}.png`;
    if (fs.existsSync(file) && !FORCE) { console.log(`  skip   ${name} (exists)`); return; }

    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "gpt-image-1",
            prompt: `${subject} ${STYLE} ${CUTOUT}`,
            size: "1024x1024",
            background: "transparent",
            output_format: "png",
            quality: "medium",
            n: 1,
        }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${name}: ${res.status} ${JSON.stringify(body).slice(0, 240)}`);

    const raw = Buffer.from(body.data[0].b64_json, "base64");

    // ⚠️ THE ALPHA FLOOR. "Transparent" comes back with stray alpha 1-2 across the whole frame, which trim()
    // then refuses to cut and drop-shadow later renders as a BOX. Anything below 8 is forced to zero first.
    const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] < 8) data[i] = 0;
    const cleaned = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();

    const trimmed = await sharp(cleaned).trim({ threshold: 10 }).png().toBuffer();
    await sharp(trimmed)
        .resize(size, size, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 90 })
        .toFile(file);

    const m = await sharp(file).metadata();
    console.log(`  wrote  ${name.padEnd(9)} ${m.width}x${m.height}  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

const wanted = SPRITES.filter(([n]) => !ONLY || ONLY.includes(n));
console.log(`generating ${wanted.length} sprite(s) at medium (~$${(wanted.length * 0.04).toFixed(2)})\n`);
for (const [name, size, subject] of wanted) {
    await makeOne(name, size, subject);
}
console.log(`\n${OUT} — check every one against a dark background before shipping.`);
