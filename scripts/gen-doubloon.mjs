// The DOUBLOON — the sailing feature's own currency.
//
// It was the Unicode character ⛃ ("black draughts king"), which is not a coin, is drawn by the operating
// system, and rendered as a flat dark disc that looked like a bug. Doubloons are the only thing ship battles
// mint and the only thing the Quartermaster takes, so the one symbol standing for all of that should be art.
//
//   node scripts/gen-doubloon.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/doubloon.png";
const force = process.argv.includes("--force");
if (fs.existsSync(OUT) && !force) { console.log("skip (exists) — pass --force to redraw"); process.exit(0); }

const PROMPT = [
    "A single gold PIRATE DOUBLOON coin seen face-on at a slight three-quarter tilt, thick and chunky with a",
    "milled edge, a worn skull-and-crossed-cutlasses stamped into its face and a faint ring of old lettering",
    "around the rim. Warm antique gold with brass and amber tones, a bright specular highlight on the upper",
    "left and deep shadow in the struck relief so it reads as METAL.",
    "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high",
    "contrast, vibrant saturated colors, fantasy action-RPG style.",
    // Same framing contract as every other die-cut sprite — the model overshoots the frame unless told the
    // margin in numbers. See art-style.js.
    "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides —",
    "roughly 12% of the image empty above, below, left and right. NO part of the coin may touch or run off any",
    "edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT",
    "background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo,",
    "NO white sticker rim, NO stack of coins, NO second coin. No text, no words, no letters, no watermark.",
].join(" ");

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    // A currency mark appears on every price in the feature and is read at 16-22px, so it needs a clean strike.
    body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image returned");

// Enforce the margin the prompt only asks for, then land it on a small square — this is drawn at 16-22px, so
// shipping a 1024 png would be the heaviest thing on the screen for the smallest mark on it.
const raw = Buffer.from(b64, "base64");
const trimmed = await sharp(raw).trim({ threshold: 10 }).png().toBuffer();
const m = await sharp(trimmed).metadata();
const pad = Math.round(Math.max(m.width, m.height) * 0.08);
const padded = await sharp(trimmed)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
await sharp(padded).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(OUT);
console.log("wrote", OUT, fs.statSync(OUT).size, "bytes");
