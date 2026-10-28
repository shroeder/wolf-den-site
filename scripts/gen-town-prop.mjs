// ── A STANDING PROP FOR THE STREET ───────────────────────────────────────────────────────────────────────────
// Die-cut fixtures that stand on the town street beside the NPCs — not buildings, not ground. The first is the
// act board: the thing you tap to read what this act is asking of you.
//
// ⚠️ ONE SPRITE FOR ALL SEVEN TOWNS, ON PURPOSE. A board themed per biome would be seven images for a fixture
// the player taps rather than looks at, and a notice board made of planks and pinned paper reads correctly in
// a forest, a cave and a desert alike. The town around it supplies the setting.
//
//   node scripts/gen-town-prop.mjs actboard
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

import sharp from "sharp";

register("./lib/app-loader.mjs", import.meta.url);
const { IMAGE_MODEL } = await import("@/lib/marketplace/image-model.js");
await import("./lib/ai-trace.mjs");

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();

const OUT = "public/images/town";
const PROPS = {
    actboard: "A free-standing wooden notice board on two sturdy posts, planks weathered grey-brown, with "
        + "three or four pieces of parchment pinned to it by iron nails, one curling at the corner, and a "
        + "small carved wolf's head at the top of the frame",
};

// Same house treatment as the nav icons: a single object, loud silhouette, read small.
const STYLE = "Painterly cel-shaded 2D video-game art with a strong dark ink contour around the silhouette "
    + "and each major form, flat two or three tone steps, rich saturated colour, chunky and slightly "
    + "exaggerated proportions. A SINGLE isolated object, centred, seen straight on from the side, standing "
    + "upright on nothing.";
const BAN = "FULLY TRANSPARENT background — no ground, no shadow, no scene, no sky, no characters, no text, "
    + "no letters or writing on the parchment, no logo. Nothing but the object itself.";

const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!want.length) { console.log(`props: ${Object.keys(PROPS).join(" ")}`); process.exit(0); }

for (const key of want) {
    if (!PROPS[key]) { console.error(`no such prop: ${key}`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: IMAGE_MODEL, prompt: `${PROPS[key]}. ${STYLE} ${BAN}`,
            size: "1024x1024", quality: "medium", background: "transparent", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`✗ ${key}: ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`✗ ${key}: no image back`); continue; }

    // ⚠️ TRIMMED TO ITS OWN EDGES, and floored first. "Transparent" from this model is routinely alpha 1-30
    // around the subject, so a trim without the floor finds the whole plate and does nothing — the lesson the
    // town foregrounds taught, applied before it can be re-learned.
    const { data, info } = await sharp(Buffer.from(b64, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= 40) data[i] = 0;
    const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer();
    const file = path.join(OUT, `${key}.png`);
    fs.writeFileSync(file, out);
    const m = await sharp(out).metadata();
    console.log(`✓ ${key}  ${m.width}x${m.height}  ${Math.round(out.length / 1024)}kb`);
}
