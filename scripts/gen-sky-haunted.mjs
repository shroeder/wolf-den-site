// THE HAUNTED HORIZON — the sky sailing wears when the Halloween flag is up.
//
// Run:  node scripts/gen-sky-haunted.mjs [--force]
//
// ⚠️ AND THE HORIZON SITS AT ~58%, LIKE EVERY OTHER SKY. The first version put it three quarters of the way
// down, which measured at 86% against 53-67% for the ten existing horizons — so the boat sat crammed into a
// sliver of water at the bottom of the panel. Luke: "the water line is too low." Measured, not guessed: the
// check is the sharpest brightness step in the lower two thirds of each image.
//
// ⚠️ NOTHING SINGULAR IN THE SKY. NO MOON, NO ONE BIG SHAPE. This is the trap that already cost the night
// sky its painted art: the horizon strip is drawn as FOUR copies with every other one mirrored
// (.sail-sky-scroll img:nth-child(even) { transform: scaleX(-1) }), which is what makes a non-tiling painting
// seam invisibly. Anything that reads as a single object therefore appears FOUR TIMES across the strip, and
// `sky-night.png` had to be thrown away and rebuilt in CSS for exactly that reason — its moon mirror-tiled
// onto every copy.
//
// So this paints WEATHER, not a scene: an even band of sickly cloud with no focal point, no landmark, no
// silhouette. The blood moon people expect from a Halloween sky is a separate DOM element in SailingSea,
// positioned once, which is both the only way to have one and a better way — it can sit at a fixed spot in
// the frame while the clouds scroll past behind it, which is what a real moon does.
//
// COST: one gpt-image-1 image at `medium`, 1536x1024 — about six cents. High quality is reserved for art the
// player looks AT; this is 1000px of background behind a boat, and the ten existing skies set the bar.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing";
const FILE = `${OUT}/sky-haunted.png`;
const FORCE = process.argv.includes("--force");

if (fs.existsSync(FILE) && !FORCE) {
    console.log(`${FILE} already exists — pass --force to redraw it (that costs another generation).`);
    process.exit(0);
}

// The house naval style, matched to the other ten skies so the haunted one is plainly the same game with the
// lights changed — not a different art pack bolted on.
// ⚠️ THE WATER HAS TO READ AS WATER, WHICH IS WHAT THE FIRST THREE ATTEMPTS GOT WRONG. Every one of them
// painted a sea in the same value and hue as the cloud above it — technically a horizon, visually one
// continuous murk, so the eye never found a surface and the boat looked like it was hanging in fog. Moving
// the horizon line did not help, because the line was never the problem.
//
// So the prompt now spends its words on CONTRAST across the horizon and on SURFACE DETAIL: waves with lit
// crests, a moon path, a hard edge. A sea that is obviously a sea at a glance, from six feet away, on a
// phone.
const PROMPT =
    "Wide cinematic HORIZON BACKDROP for a cartoon mobile game, painterly cel-shaded style with bold shapes "
    + "and rich saturated colour. A HAUNTED HALLOWEEN NIGHT AT SEA. "
    + "COMPOSITION, and this is the most important part: the image is split by a CRISP, CLEARLY VISIBLE "
    + "HORIZON LINE at roughly 55% of the way down. "
    + "ABOVE the line — a bruised purple-black night sky with heavy rolling cloud banks lit from within by a "
    + "sickly acid-green glow. "
    + "BELOW the line — OPEN OCEAN, and it must be UNMISTAKABLY WATER: clearly DARKER and MORE BLUE than the "
    + "sky above it, with distinct rolling waves and swells drawn as individual shapes, pale moonlit "
    + "highlights running along the crests, and the wave shapes getting LARGER and more detailed toward the "
    + "bottom of the frame as the water comes nearer the viewer. "
    + "⚠️ THE SEA AND THE SKY MUST BE STRONGLY DIFFERENT IN BRIGHTNESS AND COLOUR so the horizon reads "
    + "instantly. Do NOT let the cloud colour bleed down into the water. Do NOT paint a dark murky band that "
    + "could be either. The water is a deep blue-teal with visible surface texture; the sky is purple and "
    + "green. Somebody glancing at this for half a second must see where the sea starts. "
    + "⚠️ ABSOLUTELY NO SINGLE FOCAL OBJECT ANYWHERE. NO MOON, no sun, no stars picked out, no lightning, no "
    + "island, no land, no rocks, no lighthouse, no ships, no sails, no birds, no bats, no figures, no text. "
    + "The cloud and the waves must both be EVEN AND CONTINUOUS ACROSS THE WHOLE WIDTH with no centrepiece — "
    + "this image is tiled and mirrored end to end, so any one distinctive shape will visibly repeat four "
    + "times. Treat it as WEATHER AND WATER, not as a scene. "
    + "Keep the left and right edges similar in tone and density so the tiling reads as continuous.";

console.log("generating the haunted horizon (medium quality, ~$0.06)...");
const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
        model: "gpt-image-1",
        prompt: PROMPT,
        size: "1536x1024",
        output_format: "png",
        quality: "medium",
        n: 1,
    }),
});
const body = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);

const png = Buffer.from(body.data[0].b64_json, "base64");

// ── PUT THE HORIZON WHERE IT WAS ASKED FOR ───────────────────────────────────────────────────────────────
// ⚠️ THE MODEL WILL NOT HIT A STATED PERCENTAGE. "Three quarters down" produced 86%; "roughly 58%" produced
// 75%. Rerolling the prompt is paying per attempt for a number that can be measured and fixed for free — so
// the horizon is FOUND in the returned image and the sky above it is cropped until the water fills the share
// it should. Deterministic, costs nothing, and works whatever the model felt like drawing.
const WANT_WATER = 0.40;                       // water as a share of the final image
const probe = await sharp(png).resize({ width: 200 }).greyscale().raw().toBuffer({ resolveWithObject: true });
const rows = [];
for (let y = 0; y < probe.info.height; y++) {
    let sum = 0;
    for (let x = 0; x < probe.info.width; x++) sum += probe.data[y * probe.info.width + x];
    rows.push(sum / probe.info.width);
}
let bestY = 0, bestD = 0;
for (let y = Math.floor(probe.info.height * 0.3); y < probe.info.height - 2; y++) {
    const d = Math.abs(rows[y + 1] - rows[y]);
    if (d > bestD) { bestD = d; bestY = y; }
}
const horizonFrac = bestY / probe.info.height;
const meta0 = await sharp(png).metadata();
const horizonPx = Math.round(horizonFrac * meta0.height);
const waterPx = meta0.height - horizonPx;
// Height that puts `waterPx` at WANT_WATER of the frame; never taller than what we have.
const targetH = Math.min(meta0.height, Math.round(waterPx / WANT_WATER));
const cropTop = meta0.height - targetH;
console.log(`horizon found at ${(horizonFrac * 100).toFixed(0)}% — cropping ${cropTop}px of sky so water is ${(WANT_WATER * 100).toFixed(0)}%`);

await sharp(png)
    .extract({ left: 0, top: cropTop, width: meta0.width, height: targetH })
    .removeAlpha()
    .png({ quality: 90 })
    .toFile(FILE);

const meta = await sharp(FILE).metadata();
const size = fs.statSync(FILE).size;
console.log(`wrote ${FILE}  ${meta.width}x${meta.height}  ${(size / 1024).toFixed(0)}KB  alpha=${meta.hasAlpha}`);
console.log("Compare it against the other skies before shipping — it has to look like the same weather system.");
