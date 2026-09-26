// THE DIG PIT, WHEN THE HALLOWEEN FLAG IS UP.
//
// Run:  node scripts/gen-dig-haunted.mjs [--force]
//
// ⚠️ THE SAME PIT WITH THE LIGHTS CHANGED, NOT A DIFFERENT SCREEN. The existing dig backdrops are all one
// composition — a rough excavation wall filling the frame, glowing veins running through it, treasure
// embedded in the rock, a floor strip along the bottom. A Halloween version that abandoned that would read
// as a different game rather than as the same dig at the wrong time of year, and the HUD, the grid and the
// tiles are all laid out expecting that framing.
//
// So: same wall, same veins, same embedded-things-to-find — but grave dirt instead of stone, roots and bone
// instead of gems, and a sickly green glow where the gold was.
//
// COST: one gpt-image-1 image at `medium`, 1536x1024 — about six cents, matching the four dig backdrops it
// sits beside.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const FILE = "public/images/sailing/dig-haunted.png";
if (fs.existsSync(FILE) && !process.argv.includes("--force")) {
    console.log(`${FILE} exists — pass --force to redraw (costs another generation).`);
    process.exit(0);
}

const PROMPT =
    "Backdrop for a digging minigame in a cartoon mobile game, painterly cel-shaded style with bold shapes "
    + "and rich colour. A HAUNTED GRAVE-PIT WALL seen head on, filling the entire frame: packed cold dark "
    + "earth and crumbling clay, shot through with GLOWING SICKLY-GREEN VEINS of spectral light that branch "
    + "across the wall like cracks. Embedded in the soil and half-exposed: pale old BONES, a weathered "
    + "skull or two, gnarled dead tree roots, and a few rotten coffin boards with rusted nails. Faint "
    + "green will-o'-the-wisp motes drifting in the air. A narrow strip of loose grave dirt along the very "
    + "bottom edge as the pit floor. "
    + "MOOD: cold, eerie, and lit almost entirely by the green glow in the veins — the opposite of a warm "
    + "torchlit mine. Deep blue-black and grey-green earth, never brown and never golden. "
    + "COMPOSITION: an even wall across the whole width with no single centrepiece — bright coloured game "
    + "pieces are drawn on top of the middle of this, so keep the centre darker and calmer and push the "
    + "brightest veins and the largest bones toward the edges and corners. "
    + "NO text, no words, no letters, no UI, no characters, no figures, no tools, no shovel, no treasure "
    + "chest, no gold, no gems, no watermark, no border.";

console.log("generating the haunted dig pit (medium, ~$0.06)...");
const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
        model: "gpt-image-1", prompt: PROMPT, size: "1536x1024",
        output_format: "png", quality: "medium", n: 1,
    }),
});
const body = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);

await sharp(Buffer.from(body.data[0].b64_json, "base64"))
    .resize(1536, 1024, { fit: "cover" })
    .removeAlpha()
    .png({ quality: 90 })
    .toFile(FILE);

const m = await sharp(FILE).metadata();
console.log(`wrote ${FILE}  ${m.width}x${m.height}  ${(fs.statSync(FILE).size / 1024).toFixed(0)}KB`);

// ⚠️ THE GAME PIECES SIT OVER THE MIDDLE. A backdrop that is brightest in the centre fights the grid, so the
// centre is measured rather than hoped for — the same check the battle backdrop uses.
const { data, info } = await sharp(FILE).resize({ width: 300 }).greyscale().raw().toBuffer({ resolveWithObject: true });
const mean = (x0, x1, y0, y1) => {
    let s = 0, n = 0;
    for (let y = Math.floor(info.height * y0); y < Math.floor(info.height * y1); y++)
        for (let x = Math.floor(info.width * x0); x < Math.floor(info.width * x1); x++) { s += data[y * info.width + x]; n++; }
    return s / n;
};
const centre = mean(0.3, 0.7, 0.25, 0.75);
const edges = (mean(0, 0.2, 0.1, 0.9) + mean(0.8, 1, 0.1, 0.9)) / 2;
console.log(`centre ${centre.toFixed(0)} vs edges ${edges.toFixed(0)} — ${centre <= edges + 4 ? "ok, the grid will read" : "⚠️ CENTRE IS BRIGHTER; the grid will fight it"}`);
