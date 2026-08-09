// THE SEA THE SHIP BATTLE IS FOUGHT ON.
//
// This is the RAID backdrop style (see gen-raid-bg.mjs) with one thing changed. Everything sailing is drawn
// as a "cartoon mobile game, painterly cel-shaded, bold shapes, rich saturated colour" naval scene — storm
// clouds with god-rays, whitecaps, distant islands, cannon-smoke haze. Two earlier attempts here drifted off
// that: the first was a hot golden sunset that fought the ships for attention, and the correction over-swung
// into muted low-contrast realism, which stopped competing but no longer looked like this game. The style
// string below is lifted from the raid generator on purpose.
//
// The one deliberate difference is COMPOSITION. The raid backdrops put sky in the upper two thirds and sea in
// the lower third, because a raid draws its ships low. This scene puts its horizon a third of the way down
// and needs open water filling the bottom two thirds, because the enemy ship rides high in the frame — a
// horizon at half leaves her sailing through the sky.
//
// The second difference is where the light goes: the break in the cloud is pushed to one SIDE, so the bright
// specular path does not run up the middle of the frame, which is exactly where the fighting happens.
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

// Lifted from gen-raid-bg.mjs so the two screens are unmistakably the same game, then re-composed.
const COMMON =
    "Wide cinematic NAVAL BATTLE backdrop for a cartoon mobile game, painterly cel-shaded style with bold "
    + "shapes and rich saturated color. Dramatic towering storm clouds with shafts of god-ray light breaking "
    + "through, a churning open ocean with foamy whitecaps and rolling swells, faint misty distant islands on "
    + "the horizon, drifting cannon-smoke haze. Epic, moody, high-stakes atmosphere. "
    + "COMPOSITION: the HORIZON sits HIGH, about one third down from the top. Sky fills only the TOP THIRD. "
    + "The lower TWO THIRDS is churning open sea seen from just above the waves, with the swells growing "
    + "larger toward the bottom edge. Push the break in the cloud and its god-rays OFF TO ONE SIDE so the "
    + "middle of the water stays darker and calmer — brightly coloured ships are painted over the centre. "
    + "ABSOLUTELY NO SHIPS ANYWHERE IN THE IMAGE — not in the foreground, not in the distance, not on the "
    + "horizon, not as silhouettes. No boats, no sails, no masts, no hulls, no rigging, no characters. The "
    + "two ships in this scene are painted on top separately and anything the backdrop adds fights them. "
    + "Empty sea and sky only. NO text, NO letters, NO UI, NO watermark, NO border.";

const SHOTS = {
    "battle-bg": "Golden-hour stormy clash: warm amber and orange light punching through slate-grey "
        + "thunderheads off to the left, deep teal-and-gold sea. " + COMMON,
    "battle-bg-night": "Moonlit night clash: deep indigo and violet storm sky, a pale moon behind torn clouds "
        + "off to the right, cold cyan moonlight on near-black swells, scattered stars. " + COMMON,
};

const HORIZON_AT = 0.34;
for (const [name, subject] of Object.entries(SHOTS)) {
    const dest = `${OUT}/${name}.webp`;
    if (fs.existsSync(dest) && !FORCE) { console.log(`  ${name}: on disk, skipping (--force to redraw)`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: subject, size: "1024x1536", output_format: "png", quality: "high", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${name}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${name}: no image returned`); continue; }

    // PUT THE HORIZON WHERE THE SCENE'S HORIZON IS. Asking for it "about a third down" reliably returns about
    // half, so find the real one — the strongest bright-to-dark horizontal edge — and crop the sky above it
    // until it lands at HORIZON_AT.
    const buf0 = Buffer.from(b64, "base64");
    const { width, height } = await sharp(buf0).metadata();
    const { data, info } = await sharp(buf0).raw().toBuffer({ resolveWithObject: true });
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
    const buf = await sharp(buf0)
        .extract({ left: 0, top, width, height: Math.min(outH, height - top) })
        .webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(dest, buf);
    console.log(`  ${name.padEnd(16)} ${(buf.length / 1024).toFixed(0)}kb  horizon ${(horizon / height * 100).toFixed(0)}% -> ${(HORIZON_AT * 100).toFixed(0)}%`);
}
