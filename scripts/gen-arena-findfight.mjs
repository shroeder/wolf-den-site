// THE ARENA'S "FIND A FIGHT" SPRITE.
//
// The button that replaced the opponent lists is the loudest thing on the arena screen, and it was wearing a
// flat black react-icons glyph on a gold plate — line art on a solid fill, which is the one combination that
// reads as a placeholder. The sea's equivalent button has had a painted spyglass since the day it shipped
// (/images/sailing/find-fight.png); this is the arena's.
//
// Drawn to sit ON GOLD, which is the whole constraint: the sprite has to hold its own against a bright warm
// plate, so it is steel and blue-grey with a dark ink contour rather than anything yellow.
//
// Run:  node scripts/gen-arena-findfight.mjs [--force]
import fs from "node:fs";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/arena";
fs.mkdirSync(OUT, { recursive: true });
const dest = `${OUT}/find-fight.png`;
if (fs.existsSync(dest) && !process.argv.includes("--force")) {
    console.log("already on disk — --force to redraw");
    process.exit(0);
}

const HOUSE = "Painterly cel-shaded 2D fantasy game-icon art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

const SUBJECT = "two crossed gladiator swords over a round bronze-rimmed arena shield: the blades are bright "
    + "polished STEEL with cool blue-grey shadows, the hilts are deep red leather with dark iron crossguards, "
    + "and the shield behind them is weathered bronze and dark teal with a heavy studded rim";

const prompt = `${SUBJECT}. It will be shown at about 34 pixels ON A BRIGHT GOLD BUTTON, so it must read as `
    + `cool steel and dark metal against warm gold — avoid yellow, avoid gold as the main colour, and keep the `
    + `outline heavy. Few large shapes, no fine detail. ${DIE_CUT} ${HOUSE} ${NEGATIVE}`;

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status} ${(await resp.text()).slice(0, 200)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image returned");

const buf = await sharp(Buffer.from(b64, "base64"))
    .trim({ threshold: 6 })
    .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(dest, buf);
console.log(`drew ${dest} — ${(buf.length / 1024).toFixed(0)}kb`);
