// ── LEVEL SIX: THE ENSHRINED FORMS ───────────────────────────────────────────────────────────────────────────
// Two sprites per pet, one per stone. A pet that reaches level 6 and is enshrined wears the form of whichever
// stone you spent, for the rest of its life — so which rock you chose has to be visible on the animal.
//
// ── WHY THESE PROMPTS ARE SHAPED THE WAY THEY ARE ────────────────────────────────────────────────────────────
// Luke, on the existing ladder: "they all look the same in terms of when they level up, you can expect because
// it puts like the same blue flame and then red flame and then more red flame." He is right, and the reason is
// structural: levels 2-5 are all described as the SAME creature, slightly more so, with an aura bolted on. The
// aura is the only thing that reads at thumbnail size, so the aura is the only thing you see.
//
// So level 6 does not add an aura. It TRANSFIGURES THE BODY — the markings, the eyes, the surface of the thing,
// its extremities — and it does it in opposite directions for the two stones. At 64 pixels you should be able
// to tell a Lightstone form from a Darkstone form of the same pet without reading a word, which is a test no
// pair of flames passes.
//
// IDENTITY still holds: same species, same silhouette, same individual. This is the animal transformed, not a
// different animal. That is the line the whole ladder walks and the only reason the levels feel like one pet.
//
// ── COST ─────────────────────────────────────────────────────────────────────────────────────────────────────
// 108 pets x 2 = 216 images, generated as EDITS of each pet's existing top-level sprite so the pixels carry
// forward rather than each one being an independent reading of a sentence. Roughly $9 at `high` quality.
//
// Usage:
//   node scripts/gen-pet-level6.mjs --list                  # what would be made, and what it would cost
//   node scripts/gen-pet-level6.mjs bunny frog              # preview two pets, local files only
//   node scripts/gen-pet-level6.mjs --all --apply           # the real run: upload + point the DB at it
//   node scripts/gen-pet-level6.mjs --all --apply --resume  # skip pets that already have both forms
import fs from "node:fs";
import path from "node:path";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const ALL = ARGV.includes("--all");
const RESUME = ARGV.includes("--resume");
const LIST = ARGV.includes("--list");
const only = ARGV.filter((a) => !a.startsWith("--"));

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");
const env = fs.readFileSync("../accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.*)$/m)[1].trim());
const blobToken = env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim();

const OUT = "C:/Users/Luke/AppData/Local/Temp/claude/C--Users-Luke-Projects/60d564f9-a65a-42a5-8919-cca195dbfa73/scratchpad/pets6";
fs.mkdirSync(OUT, { recursive: true });

// Mirrors src/lib/marketplace/pet-sprite.js and scripts/regen-pet-levels.mjs — kept in step by hand, because
// this runs outside Next and cannot import from @/lib.
const HOUSE = "Cel-shaded 2D game art with bold clean dark ink contours and rich saturated colour, painterly "
    + "mobile-RPG style, fully TRANSPARENT background, no ground shadow, no text, no border, no sticker edge.";
const IDENTITY = "CRITICAL: it must remain unmistakably the SAME INDIVIDUAL CREATURE — identical species, "
    + "identical silhouette and proportions, the same character transformed. Do not replace it with a "
    + "different animal and do not restyle the artwork.";
const NO_AURA = "DO NOT simply add a coloured flame, a glowing ring or a background aura — the previous levels "
    + "already did that and every one of them looks the same at small size. The transformation must be IN THE "
    + "BODY ITSELF: its surface, its markings, its eyes, its horns/fur/scales/feathers. Any light must cling "
    + "tightly to the creature's own outline. The background stays FULLY TRANSPARENT.";

// ── KEEP THE ANIMAL'S OWN COLOURS. THIS IS THE WHOLE RULE. ──────────────────────────────────────────────────
// Second correction, and the more important one. The first pass repainted every light form gold-white and every
// dark form black-violet, and Luke's verdict was exact: "they all look the same because they're either all
// white or all dark." He is right, and it is the SAME failure as the flames — a uniform gold wash and a uniform
// black wash are still two washes. A gilded bat and a gilded bear are both just "gold animal"; the fox stops
// being orange, the frog stops being green, and the thing that made each pet itself is painted over.
//
// So neither stone recolours the creature any more. The palette is preserved and the stone's mark is carried by
// things that SIT ON the animal — sigils along its existing markings, the eyes, the tips of horns and claws, a
// crown or a shadow. A Lightstone fox is an orange fox with gold sigils burning along its stripes. A Darkstone
// frog is a green frog with violet cracks under its skin. That is a transformation you can still recognise, and
// 108 of them will not be 108 of the same two pictures.
const KEEP_PALETTE = "ABSOLUTELY DO NOT RECOLOUR THE CREATURE. Its fur, scales, feathers and skin keep their "
    + "OWN existing colours exactly — an orange fox stays orange, a green frog stays green, a grey wolf stays "
    + "grey. You are ADDING an effect on top of the animal, not repainting it. If the finished creature is "
    + "mostly one flat colour, or if two different species would end up looking like each other, that is WRONG.";

const FORMS = {
    light: {
        label: "Lightstone",
        line: "ASCENDED — enshrined in LIGHT, but still itself. Its OWN natural markings (stripes, spots, "
            + "patches, feather edges) now glow as ENGRAVED GOLDEN SIGILS burning along where those markings "
            + "already were. Its eyes shine solid warm white-gold. The tips of its horns, claws, fangs, beak or "
            + "mane have become polished translucent crystal, catching gold light. A small crown-like ring of "
            + "floating light-shards hovers just above its head. A soft warm rim-light traces its back and "
            + "shoulders. It stands taller and calmer — serene and sanctified, and unmistakably still the same "
            + "coloured animal it always was.",
    },
    dark: {
        label: "Darkstone",
        // THIRD ATTEMPT AT THIS ONE. "Shadow" and "dark" both read to the model as "paint it black", and it
        // kept doing exactly that however the rest of the sentence was worded — the light forms came back with
        // their palettes intact while every dark one was the same violet-black creature. So the word "dark"
        // is now used ONLY for the corruption, never for the animal, the retained colour is given a number,
        // and the failure is spelled out as a prohibition with worked examples. Menace has to come from the
        // eyes, the cracks, the claws and the smoke — not from the fur.
        line: "POSSESSED — something violet has got inside it, but the animal is otherwise untouched. Its coat "
            + "keeps ITS OWN HUE at about 70% of its original saturation, slightly deepened as if lit at dusk: "
            + "a green frog is still plainly GREEN, an orange fox still plainly ORANGE, a red ladybug still "
            + "plainly RED. Its OWN natural markings (stripes, spots, patches, feather edges) now burn as "
            + "CRACKS OF VIOLET LIGHT along exactly where those markings already were, as though something is "
            + "alight beneath the skin. Its eyes glow solid violet. The tips of its horns, claws, fangs, beak "
            + "or mane have grown longer and sharper and are dipped in glossy black edged with violet. A few "
            + "THIN curls of dark smoke rise near its feet only — they must not cover, blur or touch the body. "
            + "Its posture is lower and more predatory. DO NOT PAINT THE CREATURE BLACK, near-black, grey or "
            + "purple. If somebody could not name the animal's original colour from this image, it is WRONG.",
    },
};

/** Every pet id + its prompt, read straight out of the catalogue rather than duplicated here. */
function catalogue() {
    const src = fs.readFileSync("src/lib/marketplace/collectibles.js", "utf8");
    const out = [];
    for (const m of src.matchAll(/\{ id: "([a-z0-9_]+)",[\s\S]{0,900}?spritePrompt: "([^"]+)"/g)) {
        out.push({ id: m[1], prompt: m[2] });
    }
    return out;
}

async function editTo(srcBuf, form) {
    const prompt = `Transform THIS EXACT creature into its final level-6 form. ${FORMS[form].line} `
        + `${KEEP_PALETTE} ${IDENTITY} ${NO_AURA} `
        + `Keep the same right-facing three-quarter full-body pose as the reference. ${HOUSE}`;
    const body = new FormData();
    body.append("model", "gpt-image-1");
    body.append("image", new Blob([srcBuf], { type: "image/png" }), "base.png");
    body.append("prompt", prompt);
    body.append("size", "1024x1024");
    body.append("quality", "high");
    // The edits endpoint does NOT inherit the source image's alpha — omit this and every form comes back on an
    // opaque plate. Learned the hard way on the Lv2-5 run; see regen-pet-levels.mjs.
    body.append("background", "transparent");
    body.append("output_format", "png");
    body.append("n", "1");
    const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body,
    });
    if (!r.ok) throw new Error(`${form} ${r.status}: ${(await r.text()).slice(0, 180)}`);
    return Buffer.from((await r.json()).data[0].b64_json, "base64");
}

// ── WHAT WE EDIT FROM ────────────────────────────────────────────────────────────────────────────────────────
// The pet's HIGHEST existing sprite (Lv5 if it has one, else the base). Editing from the top rung means level 6
// reads as the next step of that pet rather than as a fork off the baby form.
const [baseRows, lvRows, doneRows] = await Promise.all([
    sql`SELECT pet_id, url FROM mkt_pet_sprite WHERE url IS NOT NULL`,
    sql`SELECT pet_id, level, url FROM mkt_pet_sprite_level WHERE url IS NOT NULL AND variant = '' ORDER BY level ASC`,
    sql`SELECT pet_id, variant FROM mkt_pet_sprite_level WHERE level = 6 AND url IS NOT NULL`,
]);
const baseUrl = new Map(baseRows.map((r) => [r.pet_id, r.url]));
const topUrl = new Map(baseRows.map((r) => [r.pet_id, r.url]));
for (const r of lvRows) topUrl.set(r.pet_id, r.url);          // ordered ASC, so the last write is the highest
const have = new Set(doneRows.map((r) => `${r.pet_id}:${r.variant}`));

let pets = catalogue();
if (only.length) pets = pets.filter((p) => only.includes(p.id));
else if (!ALL && !LIST) { console.error("Name pets, or pass --all. --list to see the bill first."); process.exit(1); }

const jobs = [];
for (const p of pets) {
    for (const form of ["light", "dark"]) {
        if (RESUME && have.has(`${p.id}:${form}`)) continue;
        if (!topUrl.has(p.id)) continue;   // no art at all yet — the Lv1 pass has to run first
        jobs.push({ ...p, form });
    }
}

console.log(`${pets.length} pets, ${jobs.length} images to make (~$${(jobs.length * 0.042).toFixed(2)} at high quality)`);
console.log(`${pets.filter((p) => !topUrl.has(p.id)).length} pet(s) skipped — no base sprite yet`);
if (LIST) process.exit(0);

// ── RUN THEM IN PARALLEL ─────────────────────────────────────────────────────────────────────────────────────
// This was a serial for-loop, and a serial for-loop over 216 network calls that each take ~90 seconds is five
// hours of a machine doing nothing but waiting. Nothing about the work is sequential: every image is an
// independent edit of a different source file. A fixed pool of workers pulling off one shared queue turns five
// hours into about forty minutes, and the only reason it was not written this way first is that I did not stop
// to ask how long it would take.
//
// EIGHT, not more. The images endpoint rate-limits, and a 429 storm would cost more time than the concurrency
// saves — so the pool is modest and a 429 is retried with a backoff rather than counted as a failure.
const POOL = 8;
const MAX_RETRY = 3;

let made = 0, failed = 0;
let cursor = 0;
const started = Date.now();

async function withRetry(fn, label) {
    for (let attempt = 1; ; attempt += 1) {
        try { return await fn(); } catch (e) {
            const rateLimited = /429|rate.?limit/i.test(e.message || "");
            if (attempt > MAX_RETRY || !rateLimited) throw e;
            // Backoff, with a little jitter so eight workers do not all wake at the same instant.
            const wait = 4000 * attempt + Math.random() * 2000;
            console.log(`  .. ${label} rate-limited, retrying in ${(wait / 1000).toFixed(0)}s`);
            await new Promise((r) => setTimeout(r, wait));
        }
    }
}

async function worker(n) {
    for (;;) {
        const i = cursor;
        cursor += 1;
        if (i >= jobs.length) return;
        const job = jobs[i];
        const label = `${job.id} ${job.form}`;
        try {
            const srcBuf = Buffer.from(await (await fetch(topUrl.get(job.id))).arrayBuffer());
            const buf = await withRetry(() => editTo(srcBuf, job.form), label);
            fs.writeFileSync(path.join(OUT, `${job.id}-lv6-${job.form}.png`), buf);

            if (APPLY) {
                const sharp = (await import("sharp")).default;
                const webp = await sharp(buf).resize({ width: 512, height: 512, fit: "inside" }).webp({ quality: 90 }).toBuffer();
                const up = await put(`marketplace/pet/${job.id}-lv6-${job.form}-${Date.now()}.webp`, webp,
                    { access: "public", token: blobToken, contentType: "image/webp" });
                await sql`INSERT INTO mkt_pet_sprite_level (pet_id, level, variant, url, updated_at)
                          VALUES (${job.id}, 6, ${job.form}, ${up.url}, NOW())
                          ON CONFLICT (pet_id, level, variant)
                          DO UPDATE SET url = ${up.url}, flip = FALSE, facing_checked_at = NULL, updated_at = NOW()`;
            }
            made += 1;
            const done = made + failed;
            const eta = ((Date.now() - started) / done) * (jobs.length - done) / 60000;
            console.log(`  ${String(done).padStart(3)}/${jobs.length}  ${job.id.padEnd(20)} ${job.form.padEnd(5)}`
                + ` ${(buf.length / 1024).toFixed(0)}KB   ~${eta.toFixed(0)}m left   [w${n}]`);
        } catch (e) {
            failed += 1;
            console.log(`  !! ${label}: ${(e.message || "").slice(0, 120)}`);
        }
    }
}

await Promise.all(Array.from({ length: Math.min(POOL, jobs.length) }, (_, n) => worker(n + 1)));

console.log(`\nmade ${made}, failed ${failed} in ${((Date.now() - started) / 60000).toFixed(1)} minutes. Previews in ${OUT}`);
if (!APPLY) console.log("(preview only — nothing uploaded. Add --apply to publish.)");
