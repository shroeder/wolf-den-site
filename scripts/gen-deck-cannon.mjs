// A single DECK CANNON, drawn side-on, for the guns that now render on a ship's hull during a battle.
//
// The gun-deck track said "more barrels in the broadside" and the broadside was an abstraction: a number in
// the HUD and some balls appearing from nowhere. If the upgrade is barrels, you should be able to count them.
//
// Deliberately tiny and side-on — these draw at ~14px along a hull, several at once, so the silhouette is the
// whole design. Facing RIGHT; the scene mirrors it for the ship on the other side.
//
//   node scripts/gen-deck-cannon.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/deck-cannon.png";
if (fs.existsSync(OUT) && !process.argv.includes("--force")) { console.log("skip (exists)"); process.exit(0); }

const PROMPT = [
    "A single naval CANNON seen from directly the side, pointing RIGHT: a stubby dark bronze barrel on a small",
    "four-wheeled wooden truck carriage, iron bands and a cascabel at the breech. Compact and heavy-looking,",
    "the whole thing wider than it is tall.",
    "Painterly cel-shaded 2D video-game art, bold clean dark outline, chunky readable silhouette, high contrast,",
    "fantasy action-RPG style.",
    "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides —",
    "roughly 12% empty on every side. NO part of it may touch any edge. ISOLATED as a clean die-cut sprite on a",
    "FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO deck, NO ground, NO cast shadow, NO glow,",
    "NO smoke, NO muzzle flash, NO crew, NO second cannon. No text, no watermark, no border.",
].join(" ");

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image returned");

// Trim tight and keep the sprite's own aspect — a cannon is wider than it is tall, and forcing it square would
// make the CSS place it by a box that is mostly empty.
const t = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 10 }).png().toBuffer();
await sharp(t).resize(128, 128, { fit: "inside", withoutEnlargement: false }).png().toFile(OUT);
const m = await sharp(OUT).metadata();
console.log("wrote", OUT, `${m.width}x${m.height}`, fs.statSync(OUT).size, "bytes");
