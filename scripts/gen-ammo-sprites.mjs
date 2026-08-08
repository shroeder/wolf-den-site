// THE AMMUNITION, as painted objects.
//
// The four rounds were react-icons glyphs — a flat single-colour outline — sitting directly beside the upgrade
// tracks, which have painted sprites. On the same card, in the same list: one half of the panel was an object
// you could imagine holding and the other half was a wireframe. Everything this game asks you to tap is a
// thing, so the rounds are things.
//
// ROUND SHOT IS NOT GENERATED. `sailing/cannonball.png` already exists and is exactly the icon a solid iron
// ball wants to be — checking the disk before drawing is the whole rule (see the art notes). Only the three
// exotics needed making.
//
// Each carries the colour its chip already uses in the fight (chain icy blue, grape rose, shell orange), so the
// sprite and the UI agree without the UI having to tint anything.
//
//   node scripts/gen-ammo-sprites.mjs            # only the ones missing
//   node scripts/gen-ammo-sprites.mjs --force    # redraw everything
//   node scripts/gen-ammo-sprites.mjs --sheet    # contact sheet, to judge them together
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/ammo";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant saturated colors, dramatic rim light, fantasy action-RPG style.";
// Same framing contract as every other die-cut sprite: the model will draw past the edge unless told the
// margin in numbers, and it will drop whatever the prompt does not insist on. See art-style.js.
const CUTOUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 10% of the image empty above, below, left and right. NO part of the object may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it. No text, no words, no letters, no logo, no watermark, no border.";
const P = (s) => `${s} ${STYLE} ${CUTOUT}`;

const AMMO = {
    chain: P("TWO heavy iron cannonballs joined by a short length of thick forged CHAIN, caught tumbling end over end in mid-air, the chain taut and swinging between them. Cold steel with pale moonlit blue rim light. Dominant colours icy blue and dark iron."),
    grape: P("A torn CANVAS POWDER BAG spilling a cluster of small iron balls out of its split seam, cord tied at the neck, the little shot tumbling loose around it. Ivory canvas catching a warm rose-pink rim light against dark iron shot. Dominant colours pale rose, ivory canvas and iron."),
    explosive: P("A cast-iron naval SHELL — a fat round bomb with a raised collar and a short burning FUSE on top, orange sparks spitting off the lit fuse and hot light catching the iron shoulder. Dominant colours fiery orange and dark iron."),
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

// SAME WEIGHT, MEASURED — not the same padding.
//
// Padding by a percentage and resizing to fit is what the other sprite scripts do, and it is not enough here:
// it preserves the aspect ratio, so a DIAGONAL subject (two balls on a chain) letterboxes inside the square and
// lands smaller than a round one. Measured, chain filled 55% of its canvas beside a cannonball filling 86% —
// side by side in a list that reads as a mistake rather than as a smaller object.
//
// So the trimmed ink is scaled until its LONGER side is exactly FILL of the canvas, then centred. Every icon
// carries the same weight whatever shape it is.
const CANVAS = 512, FILL = 0.82;
async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const target = Math.round(CANVAS * FILL);
    const fitted = await sharp(t).resize(target, target, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const m = await sharp(fitted).metadata();
    return sharp(fitted).extend({
        top: Math.floor((CANVAS - m.height) / 2), bottom: Math.ceil((CANVAS - m.height) / 2),
        left: Math.floor((CANVAS - m.width) / 2), right: Math.ceil((CANVAS - m.width) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer();
}

// Round shot is not drawn, it is ADOPTED — sailing/cannonball.png is already the right object in the right
// style. It still goes through frame(), because it was drawn by another script to another margin.
const ROUND_SRC = "public/images/sailing/cannonball.png";

if (args.includes("--sheet")) {
    // The sheet is for judging the SET — three new sprites beside a fourth they did not come with.
    const tiles = [["round", `${OUT}/round.png`],
        ...Object.keys(AMMO).map((k) => [k, `${OUT}/${k}.png`])].filter(([, f]) => fs.existsSync(f));
    const cell = 420, comp = [];
    for (let i = 0; i < tiles.length; i++) {
        comp.push({ input: await sharp(tiles[i][1]).resize(cell - 16, cell - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * cell + 8, top: 8 });
    }
    await sharp({ create: { width: tiles.length * cell, height: cell, channels: 4, background: { r: 16, g: 26, b: 38, alpha: 1 } } })
        .composite(comp).png().toFile("ammo-sheet.png");
    console.log("wrote ammo-sheet.png —", tiles.map((t) => t[0]).join(" | "));
    process.exit(0);
}

// The adopted round, framed to the same weight as the three that were drawn for this set.
if (force || !fs.existsSync(`${OUT}/round.png`)) {
    fs.writeFileSync(`${OUT}/round.png`, await frame(fs.readFileSync(ROUND_SRC)));
    console.log("wrote round (from cannonball.png)");
}

for (const [k, prompt] of Object.entries(AMMO)) {
    if (only.length && !only.includes(k)) continue;
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // `medium`, not `low`: a round is chosen at a glance in the middle of a fight, and low sheds detail
        // exactly where a small icon needs it most.
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes");
}
console.log("done");
