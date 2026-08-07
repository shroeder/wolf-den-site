// The CANNONBALL — the thing that actually crosses the screen in a ship battle.
//
// It was CSS: a 13x9 ellipse with a radial gradient, stretched further with scaleX(1.5) to fake speed, and a
// 34px radial-gradient "impact" fired off its ::after. On a phone that reads as a flat orange smear followed
// by an orange pancake hanging in mid-air — Luke's word was jank and he was right. A ball of iron should be a
// ball of iron.
//
//   node scripts/gen-cannonball.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/cannonball.png";
if (fs.existsSync(OUT) && !process.argv.includes("--force")) { console.log("skip (exists)"); process.exit(0); }

const PROMPT = [
    "A single solid IRON CANNONBALL — a perfect dark sphere of pitted cast iron, one bright specular highlight",
    "on the upper left and a warm bounced glow along the lower right rim so it reads as a heavy metal ball.",
    "Slight soot and scorch mottling across the surface. Perfectly round, seen straight on.",
    "Painterly cel-shaded 2D video-game icon art, bold clean dark outline, chunky readable silhouette, high",
    "contrast, fantasy action-RPG style.",
    "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides —",
    "roughly 14% of the image empty on every side. NO part of it may touch any edge. ISOLATED as a clean",
    "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO ground, NO cast shadow,",
    "NO glow halo, NO motion trail, NO fire, NO smoke, NO second ball. No text, no watermark, no border.",
].join(" ");

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image returned");

// Drawn at ~16px, so it ships small. Trim + pad so the sphere is centred in its own canvas and CSS can size it
// without the sprite's own margin throwing the arc off.
const trimmed = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 10 }).png().toBuffer();
const m = await sharp(trimmed).metadata();
const pad = Math.round(Math.max(m.width, m.height) * 0.06);
const padded = await sharp(trimmed).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp(padded).resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(OUT);
console.log("wrote", OUT, fs.statSync(OUT).size, "bytes");
