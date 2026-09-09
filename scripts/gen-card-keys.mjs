// ── THE THREE KEYS, AS OBJECTS RATHER THAN COLOURED NOUNS ────────────────────────────────────────────────
// Luke: "all the key options need to look a lot juicer and show a sprite for the specific key."
//
// The keys are the largest hidden thing in the run — three of them open a fourth act — and every screen that
// offered one printed a name and a price with no picture at all. "The Red Key" against a 24-point heal is a
// coloured noun against a number, and a coloured noun loses.
//
// ⚠️ THEY MUST BE TELLABLE APART BY COLOUR AND BY SHAPE. All three appear in the same run and never on the
// same screen, so a player is comparing the one in front of them against a MEMORY of the other two. Same
// silhouette family (they are a set), different ward and different stone.
//
// Run:  node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-card-keys.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import { SMALL_ICON_EXTRA, housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/cards/keys";
fs.mkdirSync(OUT, { recursive: true });

// Same value rule the status emblems are drawn to: these sit on a near-black panel, so the metal has to be
// bright enough to stand off it on its own and the colour lives in the stone.
const BRIEF = `${SMALL_ICON_EXTRA} A single ornate key seen face on, held upright with the bow at the top `
    + "and the ward at the bottom, filling most of the frame. Bright polished metal lit hard from the front "
    + "so it stands off a near-black background, with a large faceted gemstone set into the bow, glowing "
    + "from within and throwing a little coloured light onto the metal around it. No text, no letters, no "
    + "numbers, no keyring, no chain, no background scene — the key alone on transparency.";

const ART = {
    emerald: "an ornate key of bright warm gold with a deep green emerald set in its bow, the bow shaped "
        + "into curling leaves, the ward cut like a sprig",
    sapphire: "an ornate key of bright silver-white steel with a deep blue sapphire set in its bow, the bow "
        + "shaped into a rounded arch, the ward cut like a breaking wave",
    ruby: "an ornate key of bright dark iron with hot orange light in its seams and a deep red ruby set in "
        + "its bow, the bow shaped into a spiked ring, the ward cut like a row of teeth",
};

const FORCE = process.argv.includes("--force");
let made = 0, spent = 0;
for (const [id, subject] of Object.entries(ART)) {
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) continue;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: housePrompt(subject, { framing: "sprite", extra: BRIEF }),
            size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status}`, (await resp.text()).slice(0, 140)); continue; }
    const json = await resp.json();
    // Drawn at 44px on a button and 120px in the chest's reveal, so 256 is the size that serves both without
    // paying for a picture nothing ever shows.
    const png = await sharp(Buffer.from(json.data[0].b64_json, "base64"))
        .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, png);
    made += 1; spent += 0.04;
    console.log(`  ${id.padEnd(9)} ${Math.round(png.length / 1024)}kb`);
}
console.log(`\ndrew ${made} — about $${spent.toFixed(2)}`);
