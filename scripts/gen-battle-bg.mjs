// THE SEA THE SHIP BATTLE IS FOUGHT ON.
//
// The scene was drawing its own ocean out of CSS: two linear-gradients, a hairline horizon and a
// repeating-linear-gradient standing in for swell. Flat blue bands. The one surface whose whole job is to
// sell "you are out on the water in the middle of a fight", and it read like an unfinished loading screen.
//
// The game already owns a beautiful painted ocean (raid-bg-day.png), but it cannot be reused here: its
// horizon sits at 77% of the frame, so there is a sliver of water at the bottom and the ships would float
// in the sky. This scene puts its horizon at 38% and needs the bottom two-thirds to be open sea, because
// that is where two ships and their targeting furniture live.
//
// So: same family, same palette, built for THIS frame. Deliberately empty — no ships, no land, nothing with
// a silhouette — because everything with a silhouette in this scene is a thing you can shoot.
//
// Run:  node scripts/gen-battle-bg.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing";
const FORCE = process.argv.includes("--force");

const COMMON = "Painterly cel-shaded 2D fantasy game background, bold shapes, rich saturated colour, visible "
    + "brush facets, storybook RPG concept-art style. IMPORTANT COMPOSITION: the HORIZON LINE sits HIGH, about "
    + "one third down from the top of the image. Sky occupies only the TOP THIRD. The lower TWO THIRDS is open "
    + "ocean seen from just above the waves, filling the whole bottom of the frame with rolling swell and "
    + "whitecaps that grow larger toward the bottom edge. EMPTY SEA — absolutely no ships, no boats, no sails, "
    + "no islands, no land, no rocks, no people, no birds, no creatures, nothing with a silhouette. "
    + "No text, no words, no letters, no logo, no watermark, no border, no frame, no UI.";

const SHOTS = {
    "battle-bg": "A dramatic open-ocean seascape at golden hour. Heavy dark storm clouds break apart in the "
        + "top third to let a warm shaft of amber and orange light spill down onto the water. Deep teal-green "
        + "sea below, lit with gold along the wave crests, darkening to a deep blue-green at the very bottom "
        + "of the frame. Moody, cinematic, warm light against cold water.",
    "battle-bg-night": "A moonlit open-ocean seascape at night. Dark indigo storm clouds in the top third with "
        + "a cold silver moon breaking through and laying a pale path of light across the water. Deep navy and "
        + "petrol-blue sea below with silver-lit wave crests, darkening almost to black at the very bottom of "
        + "the frame. Cold, quiet, ominous.",
};

for (const [name, subject] of Object.entries(SHOTS)) {
    const dest = `${OUT}/${name}.png`;
    if (fs.existsSync(dest) && !FORCE) { console.log(`  ${name}: on disk, skipping`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: `${subject} ${COMMON}`, size: "1024x1536", output_format: "png", quality: "high", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${name}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${name}: no image returned`); continue; }
    // PUT THE HORIZON WHERE THE SCENE'S HORIZON IS. Asking for it "about a third down" gets somewhere near
    // half every time, and half is wrong here by more than it sounds: the enemy ship rides high in the frame,
    // so a horizon at 50% leaves her sailing through the sky. Find the real one (the strongest bright-to-dark
    // horizontal edge in the middle of the image) and crop the sky above it until it lands at HORIZON_AT.
    const HORIZON_AT = 0.34;
    const src = sharp(Buffer.from(b64, "base64"));
    const { width, height } = await src.metadata();
    const { data, info } = await src.clone().raw().toBuffer({ resolveWithObject: true });
    const lum = [];
    for (let y = 0; y < info.height; y += 1) {
        let l = 0, n = 0;
        for (let x = 0; x < info.width; x += 4) {
            const i = (y * info.width + x) * info.channels;
            l += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n += 1;
        }
        lum.push(l / n);
    }
    let horizon = Math.round(height * 0.5), bestDrop = -Infinity;
    for (let y = Math.floor(height * 0.3); y < Math.floor(height * 0.78); y += 1) {
        const drop = lum[y - 2] - lum[y + 2];
        if (drop > bestDrop) { bestDrop = drop; horizon = y; }
    }
    const sea = height - horizon;
    const outH = Math.min(height, Math.round(sea / (1 - HORIZON_AT)));
    const top = Math.max(0, horizon - Math.round(outH * HORIZON_AT));
    const buf = await src.extract({ left: 0, top, width, height: Math.min(outH, height - top) })
        .webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(dest.replace(/\.png$/, ".webp"), buf);
    console.log(`  ${name.padEnd(16)} ${(buf.length / 1024).toFixed(0)}kb  horizon ${(horizon / height * 100).toFixed(0)}% -> ${(HORIZON_AT * 100).toFixed(0)}%`);
}
