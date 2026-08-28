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
import { priceRun, quality, requirePreview } from "./lib/gen-guard.mjs";

const APPLY = process.argv.includes("--apply");
// ── PUBLISH THE ART YOU ACTUALLY LOOKED AT ───────────────────────────────────────────────────────────────────
// Without this, --apply GENERATES A FRESH SET and uploads that — so the contact sheet you approved is not the
// art that ships, and the preview step the money guard exists to enforce proves nothing about what members end
// up seeing. It cost a second $0.25 run to notice, and the Ironback's rung 4 was the difference between a sea
// turtle and a winged lion on two draws of the same prompt.
//
//   node scripts/regen-pet-levels.mjs ironback --from <dir> --apply
//
// Reads <dir>/<id>-lv1..5.png, uploads those exact bytes, and calls no image API at all.
const FROM_AT = process.argv.indexOf("--from");
const FROM = FROM_AT > -1 ? process.argv[FROM_AT + 1] : null;

// ── THE QUALITY IS NOW A CHOICE ──────────────────────────────────────────────────────────────────────────────
// This script hard-coded `quality: "high"` in two places, and gen-guard.mjs names it by name: "It was copied
// from regen-pet-levels.mjs ... `high` is 4x medium and it was never a decision, it was an inherited default."
// The guard was written after that cost $65 and then this script — the source of the default — was never
// changed, so every run since has quietly been the expensive one.
//
// Medium unless --high is passed. Five pets is $1.10 at medium and $4.28 at high; the difference dies in the
// 512px downscale two lines below.
const Q = quality();
// `--from <dir>` puts a bare path in argv, and a bare argv entry is how a pet id is named — so the directory
// was being read as a sixth pet and reported as "no spritePrompt found". Drop the value that follows --from.
const ids = process.argv.slice(2).filter((a, i) => !a.startsWith("--") && process.argv[i + 1] !== "--from");
if (!ids.length) { console.error("Name at least one pet id."); process.exit(1); }

// Five images per pet: Lv1 from text, then Lv2-5 as EDITS of it — an edit is billed the image plus the
// reference it was handed, which is why they are priced separately.
if (FROM) {
    console.log(`publishing ${ids.length} pet(s) from ${FROM} — no images will be generated, $0.00`);
} else {
    const total = priceRun({ count: ids.length, quality: Q })
        + priceRun({ count: ids.length * 4, quality: Q, edit: true });
    console.log(`${ids.length} pet(s) x (Lv1 + 4 edits) = ${ids.length * 5} images, $${total.toFixed(2)} total${APPLY ? "" : " — PREVIEW ONLY, nothing will be uploaded"}`);
    if (APPLY) requirePreview({ count: ids.length * 5, total });
}

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const env = fs.readFileSync("../accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.*)$/m)[1].trim());
const blobToken = env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim();
// The preview drop. Points at whatever scratchpad the session has rather than a dead path from an old one.
const OUT = process.env.PET_OUT || "C:/Users/Luke/AppData/Local/Temp/claude/C--Users-Luke-Projects/a74e73a5-2c7a-498f-9a71-6af0a5746735/scratchpad/pets";
fs.mkdirSync(OUT, { recursive: true });

// Mirrors src/lib/marketplace/pet-sprite.js — kept in step by hand because this script runs outside Next and
// can't import from @/lib. If the prompts there change, change them here.
const HOUSE = "Cel-shaded 2D game art with bold clean dark ink contours and rich saturated colour, painterly "
    + "mobile-RPG style, fully TRANSPARENT background, no ground shadow, no text, no border, no sticker edge.";
const POSE = "Full body, cute but fierce, facing and looking toward the RIGHT side of the image — a right-facing "
    + "three-quarter view, turned toward the enemy.";
const IDENTITY = "CRITICAL: it must remain unmistakably the same individual creature — identical species, "
    + "identical colour palette, identical markings, identical silhouette and proportions. This is the same "
    + "character at a later stage, NOT a different creature of the same type. Do not restyle it. "
    // The sticker edge comes back at the evolved rungs specifically, because those are the ones that mention
    // an aura — and "hugging the outline" reads to the model as a line drawn along it. Named as a defect
    // here rather than left to the house string, which says "no sticker edge" and was not enough.
    + "Do NOT draw an outline, halo, rim-light or coloured line tracing the creature's silhouette.";
const EVO = {
    2: "It has visibly matured: slightly larger and sturdier, fur/scales/feathers fuller and better groomed, posture squared and alert, eyes sharper and more determined. No magical effects yet — this rung is about the creature itself looking healthier and stronger, and it must NOT look softer or younger than the base form.",
    3: "It is battle-hardened: noticeably bigger and more muscular, a few honest marks of experience (a nicked ear, a scar, weathered plating), stance widened and braced. A faint warm glow at the eyes only.",
    // ── RUNG 4 USED TO HAND THE MODEL A MENU AND IT ORDERED THE LOT ─────────────────────────────────────
    // This said "ONE dramatic new physical feature that suits this species (heavier horns, a longer mane,
    // spreading wings, armoured plates)". Given a sea turtle, the model took horns AND a mane AND wings and
    // returned a lion-dragon: a different animal at the one rung between two good ones. The examples were
    // doing the damage — they are a list of parts to BOLT ON, and every one of them belongs to some other
    // creature. Rung 5 never had this problem because it asks for the signature feature "fully realised",
    // which can only mean something the creature already has.
    //
    // So rung 4 amplifies rather than adds, and the parts are forbidden by name because a general instruction
    // to keep the species did not survive a specific list of wings and horns.
    4: "It has reached an EPIC evolved form: substantially larger and more imposing, and ONE feature it ALREADY HAS is dramatically amplified — heavier, sharper, more formidable, the thing that makes this creature what it is. Do NOT graft on body parts the reference image does not already show: no wings, no horns, no mane, no tails, no extra limbs, no armour it is not already wearing. It must read instantly as the SAME SPECIES as the reference. Any aura must hug the creature's outline — no background, no scenery, no filled backdrop, and no glowing line or coloured rim tracing its silhouette. The background stays fully transparent.",
    5: "It has reached its ULTIMATE LEGENDARY form: the largest and most majestic version of itself, its signature feature fully realised, bearing regal and awe-inspiring. Any glow or energy must CLING TIGHTLY to the creature's own silhouette — absolutely no background, no scenery, no filled backdrop, no glowing plate behind it. The background stays fully transparent.",
};

async function genBase(pet) {
    const prompt = `${pet.spritePrompt} — a loyal battle companion. ${POSE} ${HOUSE}`;
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // HIGH, always. Pets are the thing members look at most and the cost control was showing.
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: Q, n: 1 }),
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
    form.append("quality", Q);
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
    // ── SCRAPING THE PROMPT OUT OF collectibles.js ──────────────────────────────────────────────────────
    // This used a regex that ran from the entry's `id` to `spritePrompt` through `[^}]*?` — which stops dead
    // at the FIRST closing brace, so any pet whose entry contains a nested object loses its prompt and is
    // silently skipped. The five casino pets all carry a `casinoPerk: { ... }`, and all five reported
    // "no spritePrompt found" while having one on the very next line.
    //
    // Read from the entry's start to the start of the NEXT entry instead, and find the prompt inside that
    // window. Nested braces are then just characters, which is what they always were.
    const at = src.indexOf(`{ id: "${id}",`);
    const next = at === -1 ? -1 : src.indexOf('\n    { id: "', at + 1);
    const entry = at === -1 ? "" : src.slice(at, next === -1 ? src.length : next);
    const m = entry.match(/spritePrompt: "([^"]+)"/);
    if (!m) { console.log(`SKIP ${id} — no spritePrompt found`); continue; }
    const pet = { id, spritePrompt: m[1] };
    console.log(`\n${id}: ${pet.spritePrompt.slice(0, 70)}…`);

    const levels = {};
    if (FROM) {
        for (const lv of [1, 2, 3, 4, 5]) {
            const f = path.join(FROM, `${id}-lv${lv}.png`);
            if (!fs.existsSync(f)) { console.log(`  Lv${lv} MISSING at ${f}`); continue; }
            levels[lv] = fs.readFileSync(f);
            console.log(`  Lv${lv} ${(levels[lv].length / 1024).toFixed(0)}KB (from disk)`);
        }
    } else {
        const base = await genBase(pet);
        fs.writeFileSync(path.join(OUT, `${id}-lv1.png`), base);
        console.log(`  Lv1 ${(base.length / 1024).toFixed(0)}KB`);
        levels[1] = base;
        for (const lv of [2, 3, 4, 5]) {
            try {
                const buf = await genLevel(base, lv);
                levels[lv] = buf;
                fs.writeFileSync(path.join(OUT, `${id}-lv${lv}.png`), buf);
                console.log(`  Lv${lv} ${(buf.length / 1024).toFixed(0)}KB`);
            } catch (e) { console.log(`  Lv${lv} FAILED: ${e.message}`); }
        }
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
            // ── ON CONFLICT MUST NAME THE WHOLE KEY ─────────────────────────────────────────────────────
            // The key on this table is (pet_id, level, VARIANT) — `variant` was added for the level-6
            // light/dark forms, and this line was never updated. `ON CONFLICT (pet_id, level)` matches no
            // constraint, so Postgres throws 42P10 and the whole run dies after publishing Lv1: every
            // --apply of this script has been broken since the column existed, and the failure looks like a
            // crash rather than like a missing sprite.
            //
            // '' is the base variant, which is what gen-pet-level6.mjs reads when it looks for a pet's
            // ordinary ladder. Third time this codebase has paid for an ON CONFLICT that did not match its
            // index; the first cost two weeks of silently lost writes.
            await sql`INSERT INTO mkt_pet_sprite_level (pet_id, level, variant, url, updated_at)
                      VALUES (${id}, ${Number(lv)}, '', ${up.url}, NOW())
                      ON CONFLICT (pet_id, level, variant) DO UPDATE SET url = ${up.url}, flip = FALSE, facing_checked_at = NULL, updated_at = NOW()`;
        }
        console.log(`  published Lv${lv}`);
    }
}
console.log(`\nPreviews in ${OUT}`);
