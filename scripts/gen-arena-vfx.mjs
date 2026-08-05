// ── ARENA VFX SPRITE SHEETS ──────────────────────────────────────────────────────────────────────────────────
// One image per effect, laid out as a 4×4 grid of sequential animation frames, played back with CSS steps().
//
// WHY A GRID IN ONE GENERATION rather than N separate images: an image model has no temporal consistency
// between calls, so sixteen separately-generated "frames" of the same explosion are sixteen different
// explosions. Asking for the whole sheet in a single image makes consistency the model's problem inside one
// picture, which it is actually good at — and it costs one generation instead of sixteen.
//
// WHY PURE BLACK rather than transparency: additive VFX are composited with `mix-blend-mode: screen`, under
// which black is invisible and bright pixels glow. That is how games have done fire and sparks forever, and it
// dodges the entire alpha-fringe problem — which is the same problem the house rule about outlines, sticker
// rims and drop shadows exists to avoid. No halo can be baked in, because there is no cutout edge.
//
// Usage:  node scripts/gen-arena-vfx.mjs            # everything missing
//         node scripts/gen-arena-vfx.mjs rend       # just one, for a look before spending on the rest
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs"; // every OpenAI call lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/arena/vfx";
fs.mkdirSync(OUT, { recursive: true });

export const VFX_COLS = 4;
// TWO rows, not four. Asked for a 4x4 the model reliably fills the first eight cells with a genuinely good
// sequence and leaves the bottom half black — so sixteen was never the number it wanted to give. Eight frames
// at ~14fps is a 570ms burst, which is about the length of a hit anyway.
export const VFX_ROWS = 2;
const FRAMES = VFX_COLS * VFX_ROWS;

// The grid instruction is repeated and made very concrete, because "sprite sheet" alone gets you one big
// picture of an explosion about half the time.
const SHEET = `A ${VFX_COLS}x${VFX_ROWS} SPRITE SHEET of sequential animation frames: exactly ${FRAMES} equal square cells arranged in ${VFX_ROWS} rows of ${VFX_COLS}, read left to right, top to bottom, each cell showing the NEXT moment of the same single effect as it begins, peaks and fades out completely by the final cell. Every cell the same size, perfectly aligned to an even grid, the effect centred inside its own cell and not crossing between cells.`;
const LOOK = `Bright saturated painterly 2D game VFX, bold shapes, strong glow, high contrast, fantasy action-RPG style.`;
// Pure black is load-bearing: it is what mix-blend-mode: screen turns into transparency.
const BLACK = `PURE SOLID BLACK background (#000000) everywhere, absolutely no background detail, no scenery, no character, no weapon, no grid lines, no borders between cells, no numbers, no text, no words, no watermark, no UI.`;

const VFX = {
    // One per new archetype, plus a generic impact the plain Attack can use.
    rend: `${SHEET} The effect: a violent burst of molten orange-red fire erupting upward from a point, throwing embers, then guttering down to drifting sparks. ${LOOK} ${BLACK}`,
    flurry: `${SHEET} The effect: three overlapping white-hot crescent sword slashes cutting diagonally across the cell in rapid succession, edges trailing pale blue speed streaks, then fading. ${LOOK} ${BLACK}`,
    drain: `${SHEET} The effect: ribbons of glowing crimson energy being siphoned inward toward a central point, spiralling tighter and brighter, then collapsing into a small bright pulse. ${LOOK} ${BLACK}`,
    sunder: `${SHEET} The effect: a heavy impact cracking outward into jagged white-gold shards of shattering armour plate, fragments flying apart, then dimming to dust. ${LOOK} ${BLACK}`,
    riposte: `${SHEET} The effect: a pale cyan shockwave ring expanding outward, reversing, and snapping back inward to a bright point, like a blow being returned. ${LOOK} ${BLACK}`,
    impact: `${SHEET} The effect: a sharp white-yellow impact flash with radiating spikes and a dust puff, expanding fast then dissipating. ${LOOK} ${BLACK}`,
    // The four kinds still falling back to the generated-shape layer.
    spell: `${SHEET} The effect: a rune circle igniting and rotating, throwing off arcane sparks, then collapsing inward into a bright violet flash. ${LOOK} ${BLACK}`,
    ward: `${SHEET} The effect: interlocking translucent hexagonal shield plates snapping into place to form a curved barrier, flaring bright at the seams, then dimming. ${LOOK} ${BLACK}`,
    surge: `${SHEET} The effect: golden power rising upward in a column of embers and light streaks, intensifying, then settling into a steady glow. ${LOOK} ${BLACK}`,
    gamble: `${SHEET} The effect: golden coins and dice tumbling upward through the air trailing sparks, spinning, then scattering out of frame. ${LOOK} ${BLACK}`,
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    // A sheet has to carry sixteen readable frames in one picture, so it gets the better tier —
                    // at low quality each 256px cell comes back as mush.
                    model: "gpt-image-1", prompt, size: "1024x1024", quality: "medium", n: 1,
                }),
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

// A contact sheet of the sliced cells, so the grid can be EYEBALLED. A sheet whose frames drift out of their
// cells animates as a twitching mess, and that is not something you can tell from the whole picture.
async function proof(buf, key) {
    const meta = await sharp(buf).metadata();
    const cw = Math.floor(meta.width / VFX_COLS);
    const ch = Math.floor(meta.height / VFX_ROWS);
    const tiles = [];
    for (let i = 0; i < FRAMES; i += 1) {
        const cell = await sharp(buf)
            .extract({ left: (i % VFX_COLS) * cw, top: Math.floor(i / VFX_COLS) * ch, width: cw, height: ch })
            .resize(120, 120, { fit: "fill" }).toBuffer();
        tiles.push({ input: cell, left: (i % VFX_COLS) * 124, top: Math.floor(i / VFX_COLS) * 124 });
    }
    await sharp({ create: { width: VFX_COLS * 124, height: VFX_ROWS * 124, channels: 3, background: { r: 20, g: 16, b: 26 } } })
        .composite(tiles).png().toFile(path.join(OUT, `_proof-${key}.png`));
}

const want = process.argv.slice(2);
const keys = Object.keys(VFX).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.webp`))));
console.log(`${keys.length} VFX sheet(s) to generate: ${keys.join(", ") || "(none)"}`);

const failed = [];
for (const k of keys) {
    try {
        const buf = await generate(VFX[k]);
        const out = path.join(OUT, `${k}.webp`);
        // 1024 keeps each of the sixteen cells at 256px, which is plenty at the size these play back.
        await sharp(buf).resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 84 }).toFile(out);
        await proof(buf, k);
        console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb) + _proof-${k}.png`);
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${keys.length - failed.length}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
