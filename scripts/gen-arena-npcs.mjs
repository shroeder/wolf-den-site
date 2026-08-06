// ── ARENA NPC CHALLENGERS ────────────────────────────────────────────────────────────────────────────────────
// One sprite per BAND, not per tier. The tiers are endless by design — there is always something harder to
// aspire to — so art cannot be per-tier or it would need a new generation forever. A band covers a stretch of
// tiers and the numbers inside it escalate, which is how every arcade ladder has ever worked.
//
// Same house rules as the rest of the Den's art: die-cut on transparency, bold ink contour, and never ask for
// outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the cutout.
//
// Usage: node scripts/gen-arena-npcs.mjs [key …]   (no args = every band missing art)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/arena/npc";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
// ── FRAMING ── "feet near the bottom edge" is what cropped seven of the ten. The model read it as an
// instruction to fill the canvas, so it ran the figure off both ends: veteran, champion, scrapper and
// nightmare all had ink on row 0 AND row 383 — the plume sliced off the helmet, the feet gone entirely, which
// on the sand reads as a fighter standing in a hole with the top of his head missing. Ask for the margin
// explicitly, in pixels of the frame, and check for it after (see MARGIN below) rather than trusting it.
const CUTOUT = "Full body, standing in a ready combat stance, facing right. The ENTIRE figure must fit INSIDE the frame with clear empty space on all four sides — leave roughly 8% of the frame empty above the top of the head and 6% empty below the feet, and do not let any part of the character, weapon, cape, wings or hair touch or run off any edge of the image. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. No text, no words, no letters, no logo, no watermark, no border.";
const P = (s) => `A single fantasy ARENA COMBATANT character. ${s} ${STYLE} ${CUTOUT}`;

const NPCS = {
    "straw": P("A battered straw training dummy on a wooden post, wrapped in frayed rope, a cracked wooden practice sword lashed to one arm, comically lopsided."),
    "scrapper": P("A scrawny young pit scrapper in patched leather scraps and mismatched bracers, holding a chipped shortsword, cocky grin, bare feet."),
    "regular": P("A stocky bearded den regular in worn studded leather armour with a round dented shield and a plain iron sword, steady and unimpressed."),
    "veteran": P("A scarred veteran gladiator in dark iron plate with a crested helm, twin notched axes, cape torn at the hem."),
    "champion": P("A gleaming arena champion in ornate golden ceremonial armour with a laurel-etched breastplate, a long spear and a tower shield."),
    "warlord": P("A hulking warlord in spiked black armour draped in furs, wielding an enormous two-handed cleaver, red war paint."),
    "titan": P("A towering stone-skinned titan with cracked granite plates fused to its body, glowing molten seams, enormous fists."),
    "colossus": P("A colossal armoured construct of riveted bronze and brass with a furnace glowing in its chest, piston arms, one huge hammer."),
    "nightmare": P("A nightmarish shadow knight in jagged void-black armour trailing smoke, violet flame where its face should be, a wickedly curved greatsword."),
    "ascendant": P("An ascendant celestial warrior wreathed in white-gold starlight, feathered energy wings, a radiant blade of pure light, serene and terrifying."),
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, size: "1024x1024", quality: "medium", n: 1,
                    background: "transparent",
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

// ── THE CROP CHECK ── the one defect you cannot fix after the fact. A sprite whose ink touches the canvas
// edge has been drawn cropped, and nothing downstream can put the missing head back: object-fit never clips,
// the ring's own layout was measured clean, so if a head looks sliced on the sand it is sliced in the file.
// So it is checked here, on the way in, and a flush draw is thrown away and re-rolled.
const MARGIN = 0.03;   // of the frame, required on every side — about 11px at 384

// ── THE FRAME IS OURS, NOT THE MODEL'S ───────────────────────────────────────────────────────────────────────
// Asking for margin does not get margin. Four rolls of the veteran came back at 0.0–1.0% top and 0.4–2.6%
// bottom with the instruction stated in pixels, because a model composing a character portrait fills the
// canvas — that is what a good portrait does everywhere except here, where the canvas edge is a hard clip in
// a 297px ring and a flush helmet reads as a sliced head.
//
// So the framing is done here, deterministically, and it fixes a second thing nobody had noticed: the ten
// sprites were framed all over the place — straw at 13% margins, veteran at 0% — so the SAME character art
// rendered up to 13% larger or smaller than its neighbours on the sand. One frame for all of them means the
// ladder's opponents are finally to scale with each other.
//
// This never crops: it trims to the ink, scales that to fit, and pastes it into a clean canvas.
const CANVAS = 384;
const HEAD_ROOM = 0.07;   // empty above the tallest pixel
const FOOT_ROOM = 0.05;   // empty below the feet
const SIDE_ROOM = 0.07;   // empty at each side
async function frame(buf) {
    const { data } = await sharp(buf).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const ink = await sharp(data)
        .resize({
            width: Math.round(CANVAS * (1 - SIDE_ROOM * 2)),
            height: Math.round(CANVAS * (1 - HEAD_ROOM - FOOT_ROOM)),
            fit: "inside",
        })
        .toBuffer();
    const m = await sharp(ink).metadata();
    return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{
            input: ink,
            left: Math.round((CANVAS - m.width) / 2),
            top: Math.round(CANVAS * (1 - FOOT_ROOM)) - m.height,   // stood on the same line, every band
        }])
        .webp({ quality: 88, alphaQuality: 100 })
        .toBuffer();
}
async function inkMargins(buf) {
    const img = sharp(buf);
    const m = await img.metadata();
    // trim() reports the bounding box of everything that is not transparent.
    const { info } = await img.trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const top = -info.trimOffsetTop;
    const left = -info.trimOffsetLeft;
    return {
        top: top / m.height,
        bottom: (m.height - (top + info.height)) / m.height,
        left: left / m.width,
        right: (m.width - (left + info.width)) / m.width,
    };
}
const shortSides = (mg) => Object.entries(mg).filter(([, v]) => v < MARGIN).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`);

const want = process.argv.slice(2);

// ── node scripts/gen-arena-npcs.mjs --reframe ── re-frame the art already on disk. No API calls, no cost, and
// the only thing that changes is the empty space around the character.
if (want[0] === "--reframe") {
    for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith(".webp"))) {
        const p = path.join(OUT, f);
        const before = await inkMargins(fs.readFileSync(p));
        fs.writeFileSync(p, await frame(fs.readFileSync(p)));
        const after = await inkMargins(fs.readFileSync(p));
        const pc = (o) => `T${(o.top * 100).toFixed(0)} B${(o.bottom * 100).toFixed(0)} L${(o.left * 100).toFixed(0)} R${(o.right * 100).toFixed(0)}`;
        console.log(`${f.padEnd(16)} ${pc(before)}  ->  ${pc(after)}`);
    }
    process.exit(0);
}

const keys = Object.keys(NPCS).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.webp`))));
console.log(`${keys.length} NPC sprites to generate: ${keys.join(", ") || "(none)"}`);

const failed = [];
for (const k of keys) {
    try {
        let buf = null;
        let short = [];
        // Three rolls at most: the framing is a prompt instruction, and prompts are advice, not a contract.
        for (let roll = 1; roll <= 3; roll += 1) {
            const candidate = await generate(NPCS[k]);
            short = shortSides(await inkMargins(candidate));
            if (!short.length) { buf = candidate; break; }
            console.log(`  · ${k} roll ${roll} came back cropped (${short.join(", ")}) — re-rolling`);
            buf = candidate; // keep the last one so a stubborn subject still ships something
        }
        const out = path.join(OUT, `${k}.webp`);
        // 384 matches the member hero sprites, so an NPC and a member stand at the same scale on the sand,
        // and frame() guarantees the margin the prompt only asks for.
        fs.writeFileSync(out, await frame(buf));
        const mg = await inkMargins(fs.readFileSync(out));
        console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb) margins `
            + `T${(mg.top * 100).toFixed(1)}% B${(mg.bottom * 100).toFixed(1)}% L${(mg.left * 100).toFixed(1)}% R${(mg.right * 100).toFixed(1)}%`
            + (shortSides(mg).length ? "  <-- STILL TIGHT, look at it" : ""));
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${keys.length - failed.length}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
