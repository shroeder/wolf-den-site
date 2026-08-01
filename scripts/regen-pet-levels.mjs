// Regenerate the full Lv1–5 sprite set for named pets, using the reworked prompts.
//
// Lv1 is generated from text (it's the anchor and it was always the strongest rung). Lv2–5 are EDITS of the
// freshly-made Lv1, which is the structural fix for identity drift: the base pixels carry forward instead of
// each level being an independent reading of the same sentence.
//
// Usage:
//   node scripts/regen-pet-levels.mjs hearth_cat copper_kettle          # preview: writes local files only
//   node scripts/regen-pet-levels.mjs hearth_cat copper_kettle --apply  # upload + point the DB at the new art
import fs from "node:fs";
import path from "node:path";
import "./lib/ai-trace.mjs";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) { console.error("Name at least one pet id."); process.exit(1); }

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const env = fs.readFileSync("../accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.*)$/m)[1].trim());
const blobToken = env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim();
const OUT = "C:/Users/Luke/AppData/Local/Temp/claude/C--Users-Luke-Projects/a74e73a5-2c7a-498f-9a71-6af0a5746735/scratchpad/pets";
fs.mkdirSync(OUT, { recursive: true });

// Mirrors src/lib/marketplace/pet-sprite.js — kept in step by hand because this script runs outside Next and
// can't import from @/lib. If the prompts there change, change them here.
const HOUSE = "Cel-shaded 2D game art with bold clean dark ink contours and rich saturated colour, painterly "
    + "mobile-RPG style, fully TRANSPARENT background, no ground shadow, no text, no border, no sticker edge.";
const POSE = "Full body, cute but fierce, facing and looking toward the RIGHT side of the image — a right-facing "
    + "three-quarter view, turned toward the enemy.";
const IDENTITY = "CRITICAL: it must remain unmistakably the same individual creature — identical species, "
    + "identical colour palette, identical markings, identical silhouette and proportions. This is the same "
    + "character at a later stage, NOT a different creature of the same type. Do not restyle it.";
const EVO = {
    2: "It has visibly matured: slightly larger and sturdier, fur/scales/feathers fuller and better groomed, posture squared and alert, eyes sharper and more determined. No magical effects yet — this rung is about the creature itself looking healthier and stronger, and it must NOT look softer or younger than the base form.",
    3: "It is battle-hardened: noticeably bigger and more muscular, a few honest marks of experience (a nicked ear, a scar, weathered plating), stance widened and braced. A faint warm glow at the eyes only.",
    4: "It has reached an EPIC evolved form: substantially larger and more imposing, with ONE dramatic new physical feature that suits this species (heavier horns, a longer mane, spreading wings, armoured plates). Any aura must hug the creature's outline — no background, no scenery, no filled backdrop. The background stays fully transparent.",
    5: "It has reached its ULTIMATE LEGENDARY form: the largest and most majestic version of itself, its signature feature fully realised, bearing regal and awe-inspiring. Any glow or energy must CLING TIGHTLY to the creature's own silhouette — absolutely no background, no scenery, no filled backdrop, no glowing plate behind it. The background stays fully transparent.",
};

async function genBase(pet) {
    const prompt = `${pet.spritePrompt} — a loyal battle companion. ${POSE} ${HOUSE}`;
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // HIGH, always. Pets are the thing members look at most and the cost control was showing.
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "high", n: 1 }),
    });
    if (!r.ok) throw new Error(`Lv1 ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return Buffer.from((await r.json()).data[0].b64_json, "base64");
}

async function genLevel(baseBuf, level) {
    const prompt = `Evolve THIS EXACT creature to power level ${level} of 5. ${EVO[level]} ${IDENTITY} `
        + `Keep the same art style, the same transparent background, and the same right-facing three-quarter full-body pose as the reference image.`;
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", new Blob([baseBuf], { type: "image/png" }), "base.png");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("quality", "high");
    // The edits endpoint does NOT inherit the source image's alpha — omit this and every evolved level comes
    // back on an opaque plate, which is exactly what happened on the first run.
    form.append("background", "transparent");
    form.append("output_format", "png");
    form.append("n", "1");
    const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!r.ok) throw new Error(`Lv${level} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return Buffer.from((await r.json()).data[0].b64_json, "base64");
}

const pets = await sql`SELECT 1`; // connection warm-up so a bad URL fails before we spend anything
void pets;

for (const id of ids) {
    // The pet's own description lives in collectibles.js; read it straight out of the source rather than
    // duplicating 98 prompts into this script.
    const src = fs.readFileSync("src/lib/marketplace/collectibles.js", "utf8");
    const m = src.match(new RegExp(`\\{ id: "${id}",[^}]*?spritePrompt: "([^"]+)"`));
    if (!m) { console.log(`SKIP ${id} — no spritePrompt found`); continue; }
    const pet = { id, spritePrompt: m[1] };
    console.log(`\n${id}: ${pet.spritePrompt.slice(0, 70)}…`);

    const base = await genBase(pet);
    fs.writeFileSync(path.join(OUT, `${id}-lv1.png`), base);
    console.log(`  Lv1 ${(base.length / 1024).toFixed(0)}KB`);

    const levels = { 1: base };
    for (const lv of [2, 3, 4, 5]) {
        try {
            const buf = await genLevel(base, lv);
            levels[lv] = buf;
            fs.writeFileSync(path.join(OUT, `${id}-lv${lv}.png`), buf);
            console.log(`  Lv${lv} ${(buf.length / 1024).toFixed(0)}KB`);
        } catch (e) { console.log(`  Lv${lv} FAILED: ${e.message}`); }
    }

    if (!APPLY) continue;
    const sharp = (await import("sharp")).default;
    for (const [lv, buf] of Object.entries(levels)) {
        const webp = await sharp(buf).resize({ width: 512, height: 512, fit: "inside" }).webp({ quality: 90 }).toBuffer();
        const up = await put(`marketplace/pet/${id}-lv${lv}-${Date.now()}.webp`, webp, { access: "public", token: blobToken, contentType: "image/webp" });
        if (Number(lv) === 1) {
            await sql`INSERT INTO mkt_pet_sprite (pet_id, url, flip, updated_at) VALUES (${id}, ${up.url}, FALSE, NOW())
                      ON CONFLICT (pet_id) DO UPDATE SET url = ${up.url}, flip = FALSE, facing_checked_at = NULL, updated_at = NOW()`;
        } else {
            await sql`INSERT INTO mkt_pet_sprite_level (pet_id, level, url, updated_at) VALUES (${id}, ${Number(lv)}, ${up.url}, NOW())
                      ON CONFLICT (pet_id, level) DO UPDATE SET url = ${up.url}, flip = FALSE, facing_checked_at = NULL, updated_at = NOW()`;
        }
        console.log(`  published Lv${lv}`);
    }
}
console.log(`\nPreviews in ${OUT}`);
