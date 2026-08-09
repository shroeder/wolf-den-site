// CANDIDATE SEAS.
//
// The first painted ocean was the right idea and the wrong picture: a hot golden sunset over saturated green
// water, with the brightest, highest-contrast part of the image sitting exactly where the two ships are. A
// battle backdrop has one job and it is not to be looked at — it has to RECEDE, so the ships, the targets and
// the damage read as the only things that matter. Loud water competes with everything drawn on top of it.
//
// So these are all deliberately quieter: darker in the lower two thirds, less saturated, no bright specular
// path running up the middle of the frame where the fighting happens.
//
// Run:  node scripts/gen-battle-bg-variants.mjs
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

// `dusk` won and is promoted to battle-bg.webp; `storm` is kept as battle-bg-storm.webp. Re-running writes
// candidates here again for comparison rather than clobbering what is live.
const OUT = "public/images/sailing/bgtest";
fs.mkdirSync(OUT, { recursive: true });

const COMMON = "Painterly cel-shaded 2D fantasy game background, soft brush facets, storybook RPG concept-art "
    + "style. COMPOSITION: the HORIZON LINE sits HIGH, about one third down. Sky occupies only the TOP THIRD. "
    + "The lower TWO THIRDS is open ocean seen from just above the waves. IMPORTANT: keep the lower two thirds "
    + "DARK, LOW CONTRAST and EVEN — this is a background that must sit quietly behind brightly-coloured ships "
    + "painted on top of it, so no bright highlights, no glaring specular path, no strong light streaks across "
    + "the water. EMPTY SEA — no ships, no boats, no sails, no islands, no land, no rocks, no people, no birds. "
    + "No text, no words, no letters, no logo, no watermark, no border, no UI.";

const SHOTS = {
    dusk: "Open ocean at late dusk under a heavy overcast. A narrow band of muted ember-orange light along the "
        + "horizon, everything above it deep slate-blue cloud. The water below is dark desaturated teal, almost "
        + "charcoal in the foreground, with only faint cool highlights on the swell. Moody and quiet.",
    storm: "Open ocean under a grey-green storm sky. Flat, diffuse, sunless light. Cold pewter and deep "
        + "bottle-green water with soft foam streaks, growing almost black toward the bottom of the frame. "
        + "Bleak, atmospheric, no colour anywhere near saturated.",
    fog: "Open ocean in heavy sea fog at first light. A pale wash of cool grey-gold in the sky, the horizon "
        + "half-dissolved in haze. Below, deep slate-teal water fading into mist, very soft edges, very low "
        + "contrast, darkening toward the bottom of the frame. Still and eerie.",
};

const HORIZON_AT = 0.34;
for (const [name, subject] of Object.entries(SHOTS)) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: `${subject} ${COMMON}`, size: "1024x1536", output_format: "png", quality: "high", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${name}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${name}: no image returned`); continue; }
    const src = sharp(Buffer.from(b64, "base64"));
    const { width, height } = await src.metadata();
    const { data, info } = await sharp(Buffer.from(b64, "base64")).raw().toBuffer({ resolveWithObject: true });
    const lum = [];
    for (let y = 0; y < info.height; y += 1) {
        let l = 0, n = 0;
        for (let x = 0; x < info.width; x += 4) {
            const i = (y * info.width + x) * info.channels;
            l += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n += 1;
        }
        lum.push(l / n);
    }
    let horizon = Math.round(height * 0.5), best = -Infinity;
    for (let y = Math.floor(height * 0.3); y < Math.floor(height * 0.78); y += 1) {
        const d = lum[y - 2] - lum[y + 2];
        if (d > best) { best = d; horizon = y; }
    }
    const outH = Math.min(height, Math.round((height - horizon) / (1 - HORIZON_AT)));
    const top = Math.max(0, horizon - Math.round(outH * HORIZON_AT));
    const buf = await sharp(Buffer.from(b64, "base64"))
        .extract({ left: 0, top, width, height: Math.min(outH, height - top) })
        .webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(`${OUT}/${name}.webp`, buf);
    console.log(`  ${name.padEnd(8)} ${(buf.length / 1024).toFixed(0)}kb  horizon ${(horizon / height * 100).toFixed(0)}%`);
}
