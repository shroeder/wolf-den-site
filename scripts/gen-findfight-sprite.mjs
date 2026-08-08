// THE SPRITE ON THE "FIND A FIGHT" BUTTON.
//
// It was a react-icons spyglass: a flat single-colour glyph on the one button this whole panel exists to get
// you to press. Everything else the game asks you to tap is a painted object — the upgrade tracks, the rounds
// in the rack, the doubloon itself — so the biggest button on the screen should not be the exception.
//
// NOT REUSED FROM THE TRACKS. sailing/tracks/cunning.png is already a spyglass, and reaching for it was the
// first instinct: it is a spyglass over a chart, and it MEANS the Cunning upgrade. Borrowing a track's icon for
// an action would say the button buys that track. Close enough to be wrong.
//
// So: the same instrument, drawn as its own thing — raised, in use, with the horizon in the glass rather than a
// chart under it. Warm brass to sit on the gold button without disappearing into it.
//
//   node scripts/gen-findfight-sprite.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/find-fight.png";
const force = process.argv.includes("--force");
if (fs.existsSync(OUT) && !force) { console.log("skip (exists) — pass --force to redraw"); process.exit(0); }

const PROMPT = [
    "A pirate captain's brass SPYGLASS, extended to full length and tilted up at a three-quarter angle as if",
    "raised to scan the horizon. Polished antique brass with darker banded rings, a wrap of worn brown leather",
    "around the middle barrel, and a pale blue-white glint of sky caught in the front lens.",
    "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high",
    "contrast, vibrant saturated colors, dramatic rim light, fantasy action-RPG style.",
    // Same framing contract as every other die-cut sprite — the model overshoots the frame unless told the
    // margin in numbers. See art-style.js.
    "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides —",
    "roughly 12% of the image empty above, below, left and right. NO part of it may touch or run off any edge;",
    "draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background",
    "(alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO hand holding it, NO cast shadow, NO",
    "glow halo, NO white sticker rim, NO circular badge behind it. No text, no words, no letters, no watermark.",
].join(" ");

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image came back");

// Scale the trimmed ink so its longer side is a fixed fraction of the canvas, then centre it — the same
// measured framing the ammunition sprites use, so a diagonal subject does not land smaller than a round one.
const CANVAS = 256, FILL = 0.86;
const trimmed = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 10 }).png().toBuffer();
const target = Math.round(CANVAS * FILL);
const fitted = await sharp(trimmed).resize(target, target, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const m = await sharp(fitted).metadata();
await sharp(fitted).extend({
    top: Math.floor((CANVAS - m.height) / 2), bottom: Math.ceil((CANVAS - m.height) / 2),
    left: Math.floor((CANVAS - m.width) / 2), right: Math.ceil((CANVAS - m.width) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
}).png().toFile(OUT);
console.log("wrote", OUT, fs.statSync(OUT).size, "bytes");
