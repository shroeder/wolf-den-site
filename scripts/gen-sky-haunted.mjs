// THE HAUNTED HORIZON — the sky sailing wears when the Halloween flag is up.
//
// Run:  node scripts/gen-sky-haunted.mjs [--force]
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
const PROMPT =
    "Wide cinematic HORIZON BACKDROP for a cartoon mobile game, painterly cel-shaded style with bold shapes "
    + "and rich saturated colour. A HAUNTED HALLOWEEN NIGHT SKY over open ocean: heavy rolling cloud banks lit "
    + "from within by a sickly acid-green and violet glow, ragged wisps of mist trailing beneath them, a deep "
    + "bruised purple-black upper sky fading to a cold poison-green haze along the waterline. Thin tendrils of "
    + "fog crawling across the distant water. Eerie, oppressive, beautiful — a ghost-story sky. "
    + "COMPOSITION: the HORIZON LINE sits low, roughly three quarters of the way down; sky fills the upper "
    + "three quarters and a narrow band of dark glassy water runs along the bottom. "
    + "⚠️ ABSOLUTELY NO SINGLE FOCAL OBJECT ANYWHERE. NO MOON, no sun, no stars picked out, no lightning bolt, "
    + "no island, no land, no rocks, no lighthouse, no ships, no sails, no birds, no bats, no figures, no "
    + "text. The cloud must be EVEN AND CONTINUOUS ACROSS THE WHOLE WIDTH with no centrepiece and no gap that "
    + "draws the eye — this image is tiled and mirrored end to end, so any one distinctive shape will visibly "
    + "repeat four times. Treat it as WEATHER, not as a scene. "
    + "Keep the left and right edges similar in tone and density so the tiling reads as continuous cloud.";

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
// Matched to the other skies: same pixel dimensions, no alpha. They are opaque backdrops and an alpha channel
// would only add weight to a layer that has nothing behind it.
await sharp(png).resize(1536, 1024, { fit: "cover" }).removeAlpha().png({ quality: 90 }).toFile(FILE);

const meta = await sharp(FILE).metadata();
const size = fs.statSync(FILE).size;
console.log(`wrote ${FILE}  ${meta.width}x${meta.height}  ${(size / 1024).toFixed(0)}KB  alpha=${meta.hasAlpha}`);
console.log("Compare it against the other skies before shipping — it has to look like the same weather system.");
