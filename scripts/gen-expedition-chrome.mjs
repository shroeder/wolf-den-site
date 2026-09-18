// ── THE EXPEDITION'S OWN CHROME ──────────────────────────────────────────────────────────────────────────────
// Three small props the expedition screens hold up, drawn because they were react-icons glyphs and everything
// standing next to them is painted art: the doubloon on the chip beside it, the wardens, the prizes, the
// member's own boat. A line-art glyph in that company reads as a placeholder somebody forgot to replace — and
// it was one.
//
// Everything ELSE the expedition needed was already on disk and is now wired to it instead of drawn again:
// the member's boat (sailing/boat-tier*.png, eleven forms), the purse (sailing/doubloon.png), the island and
// its prize (islands/*.webp, islands/prize/*.png). See [[check-existing-sprites-first]] — this is the short
// list of what genuinely did not exist.
//
//   node scripts/gen-expedition-chrome.mjs           # only what is missing
//   node scripts/gen-expedition-chrome.mjs --force   # redraw
//   node scripts/gen-expedition-chrome.mjs --dry     # price it and draw nothing
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";
import { priceRun, quality } from "./lib/gen-guard.mjs";
import { SMALL_ICON_EXTRA, housePrompt } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/islands/chrome";
fs.mkdirSync(OUT, { recursive: true });
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");
const Q = quality();

// Stored at 256 because the largest of these is drawn at 92px and the smallest at 24. A 1024 plate here is a
// megabyte of detail the downscale throws away before anybody sees it.
const TO = 256;

// ── ⚠️ FLOOR THE ALPHA, OR THE DROP SHADOW IS A BOX ──────────────────────────────────────────────────────────
// gpt-image-1 returned the chart on a "transparent" background that was not quite: every corner carried
// alpha 1-2 out of 255 — invisible on its own, and completely invisible in an image viewer. But the card
// draws these under `filter: drop-shadow(...)`, and drop-shadow is computed from the ALPHA CHANNEL, so a
// film of alpha-2 across the whole plate casts a shadow of the whole SQUARE. What it looks like on screen is
// a faint rectangle floating behind the sprite — the exact white-sticker-rim look the house style bans,
// arriving by a route nothing was checking for. Caught by shooting the card and looking at it.
// ⚠️ 44, NOT 12. The first floor was set from the CORNERS, which came back at alpha 1-2 — but the film is
// not uniform: a QA pass decoding the shipped PNG found the whole top edge at alpha 22-34, a grey wash that
// survived the floor and drew the drop-shadow of a rectangle behind the chart on the harbour screen. Sampling
// four corners is not sampling a plate. 44 is still far below anything the drawing itself uses (the subject
// runs 128+) and above every film these have come back with.
const ALPHA_FLOOR = 44;
async function floorAlpha(img) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < ALPHA_FLOOR) data[i] = 0;
    return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

const PIECES = {
    // The thing the whole feature is about. Held rolled on the cards ("a chart, in hand") and on the button
    // that spends it, so it has to read as a CHART and not as a scroll of writing — hence the coastline.
    chart: "A rolled-up sea chart tied with a loop of dark waxed cord, one end of the roll open enough to show "
        + "the drawing on it: an inked coastline, a scatter of tiny islands and a faint compass rose on aged "
        + "buff parchment. Warm brown ink on sun-bleached paper, the paper thick and soft-edged with age, the "
        + "open end curling. Lying at a slight angle, seen from just above",
    // The tide, on the chip that counts it down. An hourglass rather than a clock: the tide is a budget that
    // runs out, and a clock face would need numerals the house style bans anyway.
    tideglass: "A ship's hourglass: two bulbs of thick wavy glass in a heavy dark-oak frame with three turned "
        + "pillars and tarnished brass caps top and bottom, pale gold sand streaming from the upper bulb into "
        + "a small cone in the lower one, the upper bulb about a third full. Standing upright, seen from the "
        + "side at eye level",
    // The hint line under the chart, which is the screen's one piece of teaching. A spyglass because what the
    // line is about is READING the paper — how much the captain actually let you see.
    spyglass: "An old brass spyglass, collapsed to two draws, its barrel wrapped in worn dark leather with "
        + "brass rings at each joint and a lens catching a pale glint at the wide end. Lying horizontally at a "
        + "slight angle, the wide end toward the lower right",
};

const todo = Object.entries(PIECES).filter(([id]) => FORCE || !fs.existsSync(`${OUT}/${id}.png`));
console.log(`\n${Object.keys(PIECES).length} pieces · ${todo.length} to draw`);
priceRun({ count: todo.length, size: "1024x1024", quality: Q });
if (DRY) { console.log("   --dry, so nothing was drawn.\n"); process.exit(0); }

let drawn = 0, failed = 0;
for (const [id, subject] of todo) {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", size: "1024x1024", output_format: "png", quality: Q, n: 1,
            background: "transparent",
            // SMALL_ICON_EXTRA because every one of these is looked at between 18px and 52px — a loud
            // silhouette and few hues, still fully inked and shaded so they belong to the same set as the
            // doubloon sitting next to them.
            prompt: housePrompt(subject, { framing: "sprite", extra: SMALL_ICON_EXTRA }),
        }),
    });
    if (!r.ok) { failed += 1; console.log(`  ✗ ${id}: OpenAI ${r.status} ${(await r.text()).slice(0, 160)}`); continue; }
    const j = await r.json();
    const sized = sharp(Buffer.from(j.data[0].b64_json, "base64"))
        .resize(TO, TO, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    await (await floorAlpha(sized)).png({ compressionLevel: 9 }).toFile(`${OUT}/${id}.png`);
    drawn += 1;
    console.log(`  ✓ ${id}  →  ${OUT}/${id}.png`);
}
console.log(`\n  drew ${drawn}, failed ${failed}.`);
console.log("  ⚠️ Now LOOK at them together, at the size they are drawn — see [[watch-it-run-before-done]].");
console.log("     And bump ART_V in IslandWalk.js / ExpeditionClient.js on any redraw.\n");
