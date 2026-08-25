// THE MULTIPLIER REEL'S SYMBOLS — the last thing on the colossal cabinet still drawn as bare text.
//
// Luke: "the multipliers in the last reel need to be grouped and use sprites." They were `<b>×3</b>` — a
// number in a box, on a board where every other symbol is painted. Next to a hand-drawn dire wolf that reads
// as a debug label, and it sits on the one reel that decides how big a free round gets.
//
// ── WHY THE NUMERAL IS NOT IN THE ART ────────────────────────────────────────────────────────────────────
// It is the obvious thing to ask for and it is a trap. gpt-image-1 cannot be trusted with glyphs: ask it for
// "×25" and it returns ×2S, x255, or a shape that is nearly a 5. On a symbol whose ENTIRE meaning is which
// number it is, a one-in-five garble rate is not a cosmetic problem, it is a machine that lies about what it
// pays. Every prompt below therefore forbids text outright.
//
// So the model draws the PLATE — an ornate empty medallion, five of them, escalating in material the way the
// multipliers escalate in value — and the number goes on in the house display face, crisp at any size and
// correct every time. That is also how the plate can be reused if the ladder ever changes.
//
// Run:  node scripts/gen-mult-plates.mjs [--force] [--only m2,m25] [--high|--low]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";
import { priceRun, quality } from "./lib/gen-guard.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/casino/mult";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game-art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
// Die-cut, and EMPTY IN THE MIDDLE. The hollow is not decoration — it is where the numeral goes, so a plate
// that comes back with a filled centre is a plate the number has to sit on top of and fight.
const SHAPE = "A single ornate EMPTY medallion plate, vertical oval, seen straight on, filling the frame with "
    + "a little clear space on all four sides. Its CENTRE is a large smooth EMPTY recessed panel — flat, "
    + "unadorned, dark, with nothing drawn in it — ringed by a thick decorative border. All ornament is on "
    + "the RING; the middle stays empty. Drawn as a clean die-cut sprite on a FULLY TRANSPARENT background, "
    + "no backdrop, no scenery, no cast shadow, no glow halo, no white sticker rim.";
// Said three ways on purpose. This is the one instruction the whole file exists to enforce.
const NEGATIVE = "ABSOLUTELY NO TEXT of any kind: no words, no letters, no numbers, no numerals, no digits, "
    + "no runes, no symbols, no signage, no logo, no watermark. The centre panel is completely blank.";

// Five rungs, five materials. The ladder has to be readable at a glance from the material alone — somebody
// mid-free-round is not reading the number on the reel behind the one they are watching.
const PLATES = {
    // First draw came back a RECTANGLE while the other four were ovals — the set has to be one family, so
    // the shape is stated twice rather than left to the shared SHAPE clause.
    m2: "Cast BRONZE, warm brown metal with a dull hammered finish, plain riveted border, the humblest of "
        + "the set. The plate is a VERTICAL OVAL — an egg-shaped ring, NOT square, NOT rectangular",
    m3: "Polished SILVER, cool grey-white metal with a bright rim and simple engraved scrollwork",
    m5: "Rich GOLD, deep yellow metal with elaborate engraved filigree and small round studs around the ring",
    m10: "Gold set with EMERALDS, deep green cabochon gems inlaid all around a heavy engraved gold ring, softly lit from within",
    // The first draw of this one came back as PLAIN GOLD, indistinguishable from m5 — the model quietly
    // dropped every word about iridescence. It is the top rung of the ladder and the one worth chasing, so
    // the colour is now the subject of the sentence rather than an adjective hung off the end, and gold is
    // ruled out by name. If a reroll ever comes back yellow again, that is the tell.
    m25: "A RAINBOW IRIDESCENT CRYSTAL masterwork. The entire ring is carved from glowing opal that shifts "
        + "through HOT PINK, VIOLET, CYAN and ELECTRIC BLUE along its length, like fire opal or an oil "
        + "slick, lit from within and throwing coloured light. Multicoloured, NOT gold, NOT yellow, NOT "
        + "brass — the most magical and most valuable object of the five by an obvious margin",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");
const Q = quality();
const todo = Object.keys(PLATES).filter((id) => (!only || only.has(id))
    && (FORCE || !fs.existsSync(`${OUT}/${id}.png`)));

priceRun({ count: todo.length, size: "1024x1024", quality: Q });
if (!todo.length) { console.log("nothing to draw (--force to redraw)"); process.exit(0); }

let made = 0;
for (const id of todo) {
    const prompt = `${PLATES[id]}. ${SHAPE} ${HOUSE} Must read clearly at 60 pixels wide. ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: Q, n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(`${OUT}/${id}.png`, buf);
    made += 1;
    console.log(`  ${id.padEnd(5)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made} of ${todo.length}`);
