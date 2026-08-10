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

const FORMS = {
    light: {
        label: "Lightstone",
        line: "ASCENDED — it has been enshrined in LIGHT. Its coat/scales/feathers have turned pale and "
            + "luminous, like sunlit marble or white gold. Its natural markings have become GLOWING ENGRAVED "
            + "SIGILS cut into its hide, shining warm gold. Its eyes are solid burning white-gold with no "
            + "pupil. Where it has horns, claws, fangs or a mane, those have become polished translucent "
            + "crystal or gilded metal. A crown-like ring of small floating light-shards hovers close around "
            + "its head. It stands taller and calmer — serene, holy and unmistakably sanctified.",
    },
    dark: {
        // ── REWRITTEN AFTER THE FIRST 19 ─────────────────────────────────────────────────────────────────
        // The contact sheet was damning: the light forms were unmistakably a bat, a bear, a frog, an owl, a
        // scorpion — and the DARK forms had all collapsed into the same black blob with purple cracks and a
        // cloud of smoke. Two words did it. "Darkened to deep obsidian" removed every colour that told the
        // species apart, and "ragged wisps of black smoke peel off its outline" ate the outline itself. That
        // is the exact failure this whole level was meant to fix, arrived at from the other direction.
        //
        // So now: the creature keeps ITS OWN COLOURS, only deepened and desaturated; the smoke is a few thin
        // curls that must not touch the body; and the prompt says outright that a stranger has to be able to
        // name the animal. Menace comes from the eyes, the violet cracks and the extremities — not from
        // painting the whole thing black.
        label: "Darkstone",
        line: "ENSHRINED IN SHADOW. Keep the creature's OWN colours and markings clearly visible — deepen and "
            + "desaturate them rather than blacking them out, so the species is instantly recognisable. Its "
            + "natural markings now carry CRACKS OF GLOWING VIOLET LIGHT running along them, as though "
            + "something burns under the skin. Its eyes glow solid violet. Where it has horns, claws, fangs "
            + "or a mane, those have grown longer and sharper, tipped in violet. Add only a FEW THIN CURLS of "
            + "dark smoke near its feet — they must NOT cover, blur or touch the body, and the full outline of "
            + "the animal must stay crisp and unbroken against the transparent background. Its posture is "
            + "lower and more predatory. CRITICAL: a stranger must be able to name the species at a glance; "
            + "if the animal has become an unreadable dark mass, that is wrong.",
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
        + `${IDENTITY} ${NO_AURA} Keep the same right-facing three-quarter full-body pose as the reference. ${HOUSE}`;
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

let made = 0, failed = 0;
for (const job of jobs) {
    const src = topUrl.get(job.id);
    try {
        const srcBuf = Buffer.from(await (await fetch(src)).arrayBuffer());
        const buf = await editTo(srcBuf, job.form);
        const file = path.join(OUT, `${job.id}-lv6-${job.form}.png`);
        fs.writeFileSync(file, buf);
        made += 1;
        console.log(`  ${String(made).padStart(3)}/${jobs.length}  ${job.id.padEnd(20)} ${job.form.padEnd(5)} ${(buf.length / 1024).toFixed(0)}KB`);

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
    } catch (e) {
        failed += 1;
        console.log(`  !! ${job.id} ${job.form}: ${e.message}`);
    }
}

console.log(`\nmade ${made}, failed ${failed}. Previews in ${OUT}`);
if (!APPLY) console.log("(preview only — nothing uploaded. Add --apply to publish.)");
