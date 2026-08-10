// THE TWO STONES. The items you spend to enshrine a pet — referenced by pet-stones.js, both shops and the
// enshrine panel, so they need to exist before any of those draw.
//
// They have to be readable as a PAIR at 24px in a shop row: one warm and radiant, one cold and hungry, the same
// object in two moods. So they share a silhouette — a cut gemstone the size of a fist — and differ only in what
// is happening inside it, which is the same trick the level-6 pet forms use.
//
// Run:  node scripts/gen-pet-stones.mjs [--force]
import fs from "node:fs";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/pets";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game-icon art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, chunky readable silhouette, storybook RPG style.";
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

const ART = {
    "stone-light": {
        subject: "a LIGHTSTONE — a large faceted teardrop gemstone of pale gold and warm white, glowing from "
            + "within as though it holds captured sunlight, its facets throwing warm light, bound in a delicate "
            + "worn gold setting with a small loop at the top",
        note: "Warm, holy, serene. Must read at 24 pixels as a bright golden gem.",
    },
    "stone-dark": {
        subject: "a DARKSTONE — a large faceted teardrop gemstone of deep obsidian black shot through with "
            + "cracks of burning violet light, as though something is alive inside it, wisps of black smoke "
            + "curling off its surface, bound in a tarnished dark iron setting with a small loop at the top",
        note: "Cold, hungry, menacing. Must read at 24 pixels as a dark gem with violet cracks. Identical "
            + "SHAPE and SIZE to its golden twin — these are a matched pair and they will sit side by side.",
    },
};

const FORCE = process.argv.includes("--force");
let made = 0, skipped = 0;
for (const [id, spec] of Object.entries(ART)) {
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = `A single fantasy RPG game inventory icon: ${spec.subject}. ${spec.note} `
        + `${DIE_CUT} ${HOUSE} ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent",
            output_format: "png", quality: "high", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${id.padEnd(12)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (--force to redraw)`);
