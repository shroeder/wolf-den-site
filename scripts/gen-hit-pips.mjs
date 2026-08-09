// HITS, DRAWN AS THE THING BEING HIT.
//
// A ship's parts were reading as bars and percentages — a gold pill on the hull, a blue pill on the masts, a
// draining meter on every cannon. A bar is an abstraction sitting on top of a painting: it tells you a
// quantity while showing you nothing. What a player actually wants to know is "how many more balls does this
// take", and that is a COUNT, so it should be counted in objects.
//
// Three materials, because the ship is made of three things and shooting each one away should look different:
//   plank — the hull, counted in oak boards
//   sail  — the canvas, counted in sheets
//   iron  — a gun's mount, counted in plate
//
// Each has a WHOLE and a WRECKED state, and both are drawn. The wrecked one is the point: a row that goes
// "oak oak oak splinters splinters" shows what she has left AND what you have already taken off her in one
// glance, which is the one thing a draining bar can never show.
//
// These render at 12-18px. That is smaller than a badge icon, so each is a single bold shape with one strong
// contour and no interior detail that has to survive.
//
// Run:  node scripts/gen-hit-pips.mjs [--force] [--only plank,plank_gone]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/hits";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game-icon art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
// The die-cut contract, minus the halo — sprites are never drawn with a sticker rim or a cast shadow.
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

const ICONS = {
    // ── Hull: one plank is one hit.
    plank: "a single short horizontal oak ship's plank, warm honey-brown timber with visible woodgrain and two "
        + "dark iron nail heads, squared ends",
    plank_gone: "a single short horizontal ship's plank BLASTED APART in the middle, a ragged black hole "
        + "through it with pale splintered wood spikes bristling around the break, charred scorched edges, the "
        + "timber greyed and dead",
    // ── Canvas: one sheet is one hit.
    sail: "a single small square ship's sail of taut cream canvas, gently bellied by wind, bound to a short "
        + "dark wooden spar across the top",
    sail_gone: "a single small square ship's sail SHREDDED TO RAGS, torn cream canvas hanging in loose ribbons "
        + "off a short dark wooden spar, big ragged holes, grey and limp with no wind in it",
    // ── A gun's mount: one plate is one hit.
    iron: "a single small rectangular iron reinforcing plate, dark blue-grey forged metal with four heavy "
        + "rivets at the corners and a bright steel highlight along one edge",
    iron_gone: "a single small rectangular iron plate SHATTERED, buckled and split down the middle with the "
        + "halves peeling apart, rivets torn out, rust-red and blackened",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0;
for (const [id, subject] of Object.entries(ICONS)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id.replace(/_/g, "-")}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = `${subject}. ${DIE_CUT} ${HOUSE} Must read clearly at 16 pixels — one strong shape, heavy `
        + `outline, high contrast, no fine detail. ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Trim so the pip fills its box — baked-in margin renders as a tiny floating speck in a tight row.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${id.padEnd(12)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (already on disk; --force to redraw)`);
