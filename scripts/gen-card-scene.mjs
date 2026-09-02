// ── THE GROUND THEY FIGHT ON ─────────────────────────────────────────────────────────────────────────────────
// The card fight borrowed the arena's backdrop, which is a LANDSCAPE painting: its sand does not start until
// 76% of the way down, everything above that is seating, and on a portrait phone that put the fighters in mid
// air in front of the stands. Zooming it 175% got them onto the sand and cost the whole arena — the top half
// became a dark featureless wall.
//
// So this is a backdrop composed for the shot it is actually used in: portrait, with the floor line high
// enough that two fighters stand on it with room for a hand of cards underneath, and something to look at
// above them rather than a wall. Spire's fight scenes are built the same way — a floor plane you can read,
// depth behind it, and the light pooled where the fight happens.
//
// Run:  node scripts/gen-card-scene.mjs [--force] [--only arena]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/cards";
fs.mkdirSync(OUT, { recursive: true });

// The composition brief, which is the whole point of drawing a new one. Written in FRACTIONS of the frame
// because "put the horizon high" is advice and "the floor meets the wall two fifths down" is a spec.
const FRAMING = "TALL PORTRAIT composition for a phone. The stone floor begins about two fifths of the way "
    + "down the picture and fills the entire bottom three fifths, sweeping toward the viewer — a clear, open, "
    + "EMPTY floor plane with nothing standing on it. Above that line, the far wall of the arena recedes into "
    + "shadow. The warmest light pools on the floor in the middle of the frame, where two fighters will stand. "
    + "Absolutely NO people, NO creatures, NO characters anywhere in the image. Keep the upper third quieter "
    + "and darker than the floor so figures and cards read against it.";

const SCENES = {
    arena: "The sand floor of a torchlit stone amphitheatre at night, seen from the sand itself: raked "
        + "sandstone tiers and dark arched openings curving away behind, iron braziers burning low along the "
        + "wall, faded festival bunting strung high, a deep blue night sky above the rim",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0, spent = 0;
for (const [id, subject] of Object.entries(SCENES)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/scene-${id}.webp`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: housePrompt(subject, { framing: "scene", extra: FRAMING }),
            size: "1024x1536", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    const buf = await sharp(Buffer.from(b64, "base64")).resize(768, 1152).webp({ quality: 84 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1; spent += 0.063;
    console.log(`  scene-${id.padEnd(10)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} — about $${spent.toFixed(2)}`);
