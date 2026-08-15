// ── ONE VFX FRAME, GENERATED AS ONE FRAME ────────────────────────────────────────────────────────────────────
// extract-arena-vfx-peak.mjs already reached the conclusion this script acts on: "multi-frame sprite sheets
// out of an image model do not work... take the single best frame from each sheet and let CSS transforms do
// the motion." Every effect in the arena is drawn from a `<key>-peak.webp`, and the 4x2 sheet exists only as
// something to harvest one frame OUT of.
//
// So for a NEW effect there is no reason to generate a sheet at all. Asking for a grid and then throwing
// seven eighths of it away costs more, and it has a failure mode the single frame simply does not have: the
// slicer wants square cells (4 columns x 2 rows over a 2:1 image), gpt-image-1 returns a SQUARE picture, and
// a square sliced as 4x2 puts two rows of art into every frame. That is what killed the first attempt at
// freeze and disarm on 2026-08-15.
//
// PURE BLACK, same as the sheets: these composite with `mix-blend-mode: screen`, under which black is
// invisible and bright pixels glow. No cutout edge means no alpha fringe and no baked halo — the same reason
// the house art rules ban rims and drop shadows.
//
// Usage: node scripts/gen-arena-vfx-frame.mjs [key …]   (no args = everything missing)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/arena/vfx";
fs.mkdirSync(OUT, { recursive: true });

// 256 is what the sliced cells were, and what SpriteFx draws at ~210 — so this is still a downscale.
const PX = 256;
const LOOK = "Bright saturated painterly 2D game VFX, bold shapes, strong glow, high contrast, fantasy action-RPG style.";
const BLACK = "PURE SOLID BLACK background (#000000) everywhere, absolutely no background detail, no scenery, no character, no weapon, no grid, no cells, no border, no numbers, no text, no words, no watermark, no UI.";
const FRAME = (s) => `A SINGLE frame of a fantasy game VISUAL EFFECT at its PEAK — the most dramatic instant of the effect, one image, centred and filling the frame. ${s} ${LOOK} ${BLACK}`;

const FRAMES = {
    // Built against `rend`, the other status effect, so the two can never be confused mid-fight: rend is
    // molten orange erupting UPWARD, so freeze is white-blue and CLOSING INWARD.
    freeze: FRAME("Pale white-blue frost crystals stabbing inward from every edge and locking together into a solid jagged block of ice at the centre, brilliant cold light flaring where they seal, glittering shards suspended around it."),
    // Shatter's lockout. The same cold family as the freeze, but breaking apart where the freeze locks shut.
    disarm: FRAME("A pale blue-white shield of ice splitting and blowing apart into sharp frozen shards flying outward from the centre, bright cold light in the fracture lines."),
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality: "medium", n: 1 }),
            });
            if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 160)}`);
            const b64 = (await r.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((res) => setTimeout(res, 4000 * attempt));
        }
    }
    return null;
}

const want = process.argv.slice(2);
const keys = Object.keys(FRAMES).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}-peak.webp`))));
console.log(`${keys.length} frame(s) to generate: ${keys.join(", ") || "(none)"}`);

const failed = [];
for (const k of keys) {
    try {
        const buf = await generate(FRAMES[k]);
        const out = path.join(OUT, `${k}-peak.webp`);
        await sharp(buf).resize({ width: PX, withoutEnlargement: true }).webp({ quality: 88 }).toFile(out);
        console.log(`✓ ${k}-peak (${Math.round(fs.statSync(out).size / 1024)}kb)`);
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${keys.length - failed.length}/${keys.length}`);
if (failed.length) process.exit(1);
