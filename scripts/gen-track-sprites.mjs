// Sprites for the four GUN DECK upgrade tracks.
//
// They were react-icons Game-Icons glyphs in flat yellow — a single-colour outline standing in for the four
// things you actually spend doubloons on. Every other thing this game asks you to buy or tap is a painted
// object; the upgrade you are weighing should be too.
//
// Same recipe as the battle orders (gen-battle-orders.mjs): one prop per track, one dominant colour, caught
// mid-action so the row has some life standing still. Read at ~44px, so silhouette over detail.
//
//   node scripts/gen-track-sprites.mjs            # only the ones missing
//   node scripts/gen-track-sprites.mjs --force    # redraw everything
//   node scripts/gen-track-sprites.mjs --sheet    # contact sheet, to judge them together
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/tracks";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant saturated colors, dramatic rim light, fantasy action-RPG style.";
// The framing contract every die-cut sprite here uses — the model runs off the edge unless given the margin
// in numbers. See art-style.js and the note in gen-fleet-captains.mjs.
const CUTOUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 10% of the image empty above, below, left and right. NO part of the object may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it. No text, no words, no letters, no logo, no watermark, no border.";
const P = (s) => `${s} ${STYLE} ${CUTOUT}`;

const TRACKS = {
    // More barrels in the broadside.
    guns: P("A row of THREE brass naval cannons on wooden carriages, seen from a three-quarter angle, stacked as a tight gun deck battery with their muzzles toward the viewer's right. Warm brass and oiled oak, gold highlights along the barrels."),
    // A drilled crew lays the guns truer.
    // First draw put the quadrant on a FLAT navy chart, which at 44px reads as a rectangular backing plate —
    // i.e. as broken transparency rather than as art. No sheet behind it: just the instrument.
    gunnery: P("A brass gunner's QUADRANT — a quarter-circle sighting instrument with an engraved degree scale, a swinging pointer arm and a small plumb bob on a cord — held at a three-quarter angle, catching a bright glint on the brass. Warm polished brass and dark iron ONLY. NOTHING behind or underneath it: no chart, no paper, no map, no sheet, no flat panel, no rectangle of any kind."),
    // Oak and iron plate.
    hull: P("A thick curved section of a ship's OAK HULL banded with riveted iron plate and a heavy iron strake, one cannonball dented into the plate without breaking through. Deep oak brown, dark iron, cold steel highlights."),
    // Sea-dog nerve — a chance a raid does not use up your daily raid.
    cunning: P("A worn brass PIRATE SPYGLASS extended, wrapped in leather cord, lying across a folded sea chart with a tiny compass rose, one lens catching a bright glint. Antique brass, tan leather and aged parchment."),
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

// Enforce the margin the prompt only asks for, and land every icon on an identical canvas so the four rows
// show them at the same weight — without this one sprite reads twice the size of its neighbour.
async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.1);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(padded).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

if (args.includes("--sheet")) {
    const keys = Object.keys(TRACKS).filter((k) => fs.existsSync(`${OUT}/${k}.png`));
    const cell = 320, comp = [];
    for (let i = 0; i < keys.length; i++) {
        comp.push({ input: await sharp(`${OUT}/${keys[i]}.png`).resize(cell - 16, cell - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * cell + 8, top: 8 });
    }
    await sharp({ create: { width: keys.length * cell, height: cell, channels: 4, background: { r: 16, g: 26, b: 38, alpha: 1 } } })
        .composite(comp).png().toFile("track-sheet.png");
    console.log("wrote track-sheet.png —", keys.join(" | "));
    process.exit(0);
}

for (const [k, prompt] of Object.entries(TRACKS)) {
    if (only.length && !only.includes(k)) continue;
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes");
}
console.log("done");
