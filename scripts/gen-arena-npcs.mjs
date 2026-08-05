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
const CUTOUT = "Full body, standing in a ready combat stance, facing right, feet near the bottom edge, ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. No text, no words, no letters, no logo, no watermark, no border.";
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

const want = process.argv.slice(2);
const keys = Object.keys(NPCS).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.webp`))));
console.log(`${keys.length} NPC sprites to generate: ${keys.join(", ") || "(none)"}`);

const failed = [];
for (const k of keys) {
    try {
        const buf = await generate(NPCS[k]);
        const out = path.join(OUT, `${k}.webp`);
        // 384 matches the member hero sprites, so an NPC and a member stand at the same scale on the sand.
        await sharp(buf).resize({ width: 384, withoutEnlargement: true })
            .webp({ quality: 88, alphaQuality: 100 }).toFile(out);
        console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb)`);
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${keys.length - failed.length}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
