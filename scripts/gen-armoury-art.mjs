// THE ARMOURY'S ART — a laurel mark for the currency, and the three crates it buys.
//
// The currency had no face at all: "1,014 laurels" was a word, so laurels looked like a number the screen was
// telling you rather than a thing you hold. Every other currency in the Den has a coin — gold has one, the sea
// has its doubloon — and the ones with a face are the ones people talk about.
//
// The crates are three RANKS of the same object rather than three different objects, so the ladder between
// them reads at a glance: plain strapped footlocker, iron-bound strongbox, gilded war chest.
//
// Run:  node scripts/gen-armoury-art.mjs [--force]
import fs from "node:fs";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/arena/armoury";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game-icon art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

const ART = {
    // The currency's face. A wreath rather than a coin, because laurels are won rather than minted — and it
    // has to survive being drawn at 16px next to a number, so it is a bold ring and nothing else.
    laurel: {
        subject: "a victor's LAUREL WREATH — a circular ring of golden-green bay leaves, open at the top, "
            + "bound at the bottom with a small red ribbon, viewed straight on",
        note: "Must read clearly at 16 pixels: one bold ring shape, thick leaves, no fine stems.",
        size: 128,
    },
    crate_1: {
        subject: "a small plain wooden FOOTLOCKER with two leather straps and a simple iron latch, lid closed, "
            + "scuffed and well-used",
        note: "Modest and unglamorous — the cheapest thing on a shelf.",
        size: 192,
    },
    crate_2: {
        subject: "a sturdy IRON-BOUND STRONGBOX — dark oak banded with riveted iron straps and a heavy padlock, "
            + "lid closed, a few dents in the metal",
        note: "Clearly a step up from a plain footlocker: more metal, heavier build.",
        size: 192,
    },
    crate_3: {
        subject: "an ornate GILDED WAR CHEST — deep red wood with gold filigree corners, a lion-head clasp and "
            + "gold banding, lid closed, faint warm light escaping the seam of the lid",
        note: "Unmistakably the best of three: gold, ornament, and something glowing inside.",
        size: 192,
    },
};

const FORCE = process.argv.includes("--force");
let made = 0, skipped = 0;
for (const [id, spec] of Object.entries(ART)) {
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = `A single fantasy RPG game inventory icon: ${spec.subject}. ${spec.note} `
        + `${DIE_CUT} ${HOUSE} ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent",
            output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(spec.size, spec.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${id.padEnd(10)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (--force to redraw)`);
