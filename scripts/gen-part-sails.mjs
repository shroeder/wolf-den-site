// The SAILS part icon for the battle's target plaques.
//
// The three things you can shoot at each want a painted object on their marker, and two already existed:
// sailing/deck-cannon.png for a gun and sailing/tracks/hull.png for timber. Canvas had nothing, so a target
// that is most of a ship was labelled with a flat glyph while its neighbours were objects.
//
// Drawn as a single bellied sail on a spar — not a whole rig, because this is read at about 20px.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");
const OUT = "public/images/sailing/part-sails.png";
if (fs.existsSync(OUT) && !process.argv.includes("--force")) { console.log("skip (exists)"); process.exit(0); }

const PROMPT = [
    "A single square-rigged ship's SAIL bellied full of wind on a dark wooden spar, ropes trailing from its",
    "lower corners. Warm cream and ivory canvas with soft blue shadow in the folds and a crisp dark ink",
    "contour, seen straight on.",
    "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high",
    "contrast, vibrant saturated colors, fantasy action-RPG style.",
    "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides —",
    "roughly 12% of the image empty above, below, left and right. NO part may touch or run off any edge; draw",
    "it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background",
    "(alpha channel) — absolutely NO backdrop, NO scenery, NO mast, NO ship, NO sea, NO cast shadow, NO glow",
    "halo, NO white sticker rim. No text, no words, no letters, no watermark.",
].join(" ");

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
const CANVAS = 256, FILL = 0.86;
const t = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 10 }).png().toBuffer();
const target = Math.round(CANVAS * FILL);
const fitted = await sharp(t).resize(target, target, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const m = await sharp(fitted).metadata();
await sharp(fitted).extend({
    top: Math.floor((CANVAS - m.height) / 2), bottom: Math.ceil((CANVAS - m.height) / 2),
    left: Math.floor((CANVAS - m.width) / 2), right: Math.ceil((CANVAS - m.width) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
}).png().toFile(OUT);
console.log("wrote", OUT, fs.statSync(OUT).size, "bytes");
