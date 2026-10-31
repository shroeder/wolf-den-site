// ── WHY DO THE HEROES ALL HAVE THE SAME FACE NOW? ───────────────────────────────────────────────────────────
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sprite-trial.mjs --buyer <id>
//   ...                                                                             --buyer <id> --apply
//
// Luke, 2026-10-31: "we do want to do some tests to see how we can bring some personality back into the hero
// sprites, because right now their faces look straight up like they're coming from Gravatar, whereas in the
// past they used to have like personalities."
//
// ⚠️ THIS IS A REGRESSION, NOT A MISSING FEATURE, AND THAT CHANGES WHERE TO LOOK. The per-player prompt has
// said "a confident heroic standing pose" since it was written and still does — git log --follow on
// avatar-sprite.js shows the pose wording untouched through every revert. What changed is underneath it.
//
// On 2026-10-27, two commits landed on the same day:
//   57ad6948  the live image path moved to gpt-image-2.5-sunburst, "with the house style in the prompt"
//   67a9c854  draws started carrying STYLE REFERENCES as well as a description
//
// The first appended HOUSE_CHARACTER_TAIL to every hero draw, and two of its clauses act directly on a face:
//
//   "flat cel shading with only TWO OR THREE TONE STEPS per colour... no fine filigree and no hundreds of
//    tiny marks — a few large shapes must read better than many small ones"
//        → a face drawn in three flat tones with no small marks has no expression left in it. That is
//          precisely what "looks like Gravatar" describes.
//
//   "standing squarely on both feet with a WIDE PLANTED STANCE"
//        → every hero now stands identically, which is the interchangeability half of the complaint. It
//          also silently overrides the per-player "confident heroic standing pose" above it.
//
// And the tail opens by telling the model these rules "OVERRIDE ANY CONTRARY INSTINCT ABOUT WHAT A HEROIC
// CHARACTER SHOULD LOOK LIKE", so it wins the argument by construction.
//
// ⚠️ THE CHIBI CLAUSE HAS BEEN REVERTED ONCE BEFORE. 73870534, "Sprites: revert the prompt to the original.
// Less is more." It came back four days ago through the SHARED house tail rather than through this file, so
// the revert did not hold and nobody was looking at this prompt when it happened.
//
// ── WHAT THIS SCRIPT DOES ───────────────────────────────────────────────────────────────────────────────────
// Draws the same member, through the real pipeline, with one clause subtracted each time. Nothing is written
// to mkt_buyer: the live sprite is untouched and no member sees any of this. Luke: "We don't want to adjust
// the current prompt for creating hero sprites, but we do want to do some tests."
//
// ⚠️ SUBTRACTION, NOT ADDITION, WHICH IS WHY promptExtra COULD NOT DO THIS. The admin route's trial tail
// appends and "NEVER replaces anything" — correct for testing a correction, useless for testing whether a
// clause is the thing doing the damage. The only way to know is to take it out.
//
// ⚠️ THREE DRAWS, MEDIUM, IN THE FOREGROUND. House rule. The control is free: it is the sprite the member
// already has, which was drawn by the live recipe.

import fs from "node:fs";
import path from "node:path";

// ⚠️ LOAD .env.local BEFORE ANY APP IMPORT. editImage uploads through Vercel Blob, whose client reads
// BLOB_READ_WRITE_TOKEN AS IT INITIALISES — so a token set after the import is a token it never sees. The
// first run of this script skipped this and the three draws were generated, billed, and then thrown away
// on the upload: editOnce runs long before storeImage, so a storage failure costs exactly as much as a
// success. $0.04 for nothing. The same trap is documented on fix-town-art-holes.mjs.
for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split(String.fromCharCode(10))) {
        const m = /^([A-Z0-9_]+)=["']?([^"']*)/.exec(line.trim());
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}


// ⚠️ THE APP MODULES ARE IMPORTED DYNAMICALLY, BELOW, AFTER THE ENV IS LOADED. ESM hoists every static
// `import` and runs it before any module-level code, and the Vercel Blob client reads
// BLOB_READ_WRITE_TOKEN AS IT INITIALISES — so a static import here would have the client up and
// tokenless no matter where the loader sits in this file. fix-town-art-holes.mjs carries the same note.
async function app() {
    return {
        ...(await import("@/lib/db.js")),
        ...(await import("@/lib/marketplace/openai-image.js")),
        ...(await import("@/lib/marketplace/avatar-render.js")),
        ...(await import("@/lib/marketplace/avatar-sprite.js")),
        ...(await import("@/lib/marketplace/image-model.js")),
        ...(await import("@/lib/marketplace/inventory.js")),
    };
}

const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const BUYER = arg("--buyer");
const OUT = arg("--out") || "scripts/.trial";

// ── THE CLAUSES UNDER SUSPICION ─────────────────────────────────────────────────────────────────────────────
// Each is lifted VERBATIM out of HOUSE_CHARACTER_RULES. A paraphrase would be testing a different prompt and
// proving nothing; if one of these strings ever stops matching, the script says so loudly rather than
// silently drawing the control three times.
const FLAT_FACE = "flat cel shading with "
    + "only two or three tone steps per colour, large simple areas of solid colour, and a bold dark outline "
    + "around the whole figure and around every major shape inside it. No airbrushed or soft gradients, no "
    + "painterly rendering, no photographic or cinematic lighting, no rim light tracing every edge, no fine "
    + "filigree and no hundreds of tiny marks — a few large shapes must read better than many small ones. ";

const PLANTED = "standing squarely on both feet with a wide "
    + "planted stance.";

const VARIANTS = [
    {
        id: "a-no-planted-stance",
        why: "Pose only. Removes the mandated identical stance and lets the per-player 'confident heroic standing pose' win again.",
        make: (rules) => rules.replace(PLANTED, ""),
        needs: PLANTED,
    },
    {
        id: "b-no-flat-face",
        why: "Rendering only. Removes the two-or-three-tones and no-small-marks clause, which is what leaves a face with nothing in it.",
        make: (rules) => rules.replace(FLAT_FACE, ""),
        needs: FLAT_FACE,
    },
    {
        id: "c-neither",
        why: "Both removed. If this one has personality and A and B do not, the two clauses are doing it together.",
        make: (rules) => rules.replace(PLANTED, "").replace(FLAT_FACE, ""),
        needs: PLANTED,
    },
];

async function main() {
    const { db, editImage, renderAvatarPng, buildSpritePrompt, SPRITE_RULES,
        IMAGE_MODEL, houseStyleRefs, getEquippedGearPhrase } = await app();
    if (!BUYER) {
        console.log("usage: --buyer <uuid> [--apply]  — draws 3 trial sprites for one member, writes nothing live");
        process.exit(1);
    }
    const row = await db.queryOne(
        `SELECT avatar_config, avatar_sprite_url FROM mkt_buyer WHERE id = $1`, [BUYER],
    );
    if (!row?.avatar_config) { console.log("that buyer has no avatar to draw"); process.exit(1); }

    // ⚠️ THE SAME GEAR PHRASE THE LIVE DRAW USES. A trial against a different input is a comparison between
    // two different pictures, which is the trap the admin route's own note warns about.
    const gear = await getEquippedGearPhrase(BUYER).catch(() => "");
    const base = buildSpritePrompt(row.avatar_config, gear);

    const missing = VARIANTS.filter((v) => !SPRITE_RULES.includes(v.needs));
    if (missing.length) {
        console.log(`\n⚠️  ${missing.length} clause(s) no longer appear in SPRITE_RULES verbatim:`);
        for (const v of missing) console.log(`   ${v.id}`);
        console.log("   The house tail changed. Re-copy the clauses before trusting this run.\n");
        process.exit(1);
    }

    console.log(`\n── SPRITE TRIAL ──  buyer ${BUYER}`);
    console.log(`   control (free): ${row.avatar_sprite_url || "none drawn yet"}`);
    for (const v of VARIANTS) console.log(`   ${v.id.padEnd(22)} ${v.why}`);
    console.log(`\n   ${VARIANTS.length} draws at medium, model ${IMAGE_MODEL} — roughly $0.04 total.`);
    if (!APPLY) { console.log("\n   dry run — pass --apply to draw.\n"); process.exit(0); }

    fs.mkdirSync(OUT, { recursive: true });
    const png = await renderAvatarPng(row.avatar_config, 1024);
    for (const v of VARIANTS) {
        process.stdout.write(`   drawing ${v.id} … `);
        try {
            // ⚠️ STRAIGHT TO DISK, NOT THROUGH editImage. editImage uploads to Vercel Blob, and blob
            // storage does not work from this machine — OIDC is enabled for the project but not for the
            // development environment. It cost $0.08 to learn that, in two runs, because editOnce calls
            // OpenAI long BEFORE storeImage: a storage failure bills exactly like a success and then
            // throws the picture away. A trial only ever needed the bytes on disk; gen-nav-icons.mjs has
            // written them that way all along.
            //
            // The request below is editOnce's, field for field, so the draw is still the real one.
            const form = new FormData();
            form.append("model", IMAGE_MODEL);
            const refs = houseStyleRefs();
            if (refs.length) {
                form.append("image[]", new Blob([png], { type: "image/png" }), "subject.png");
                refs.forEach((b, i) => form.append("image[]", new Blob([b], { type: "image/png" }), `style-${i}.png`));
            } else {
                form.append("image", new Blob([png], { type: "image/png" }), "avatar.png");
            }
            form.append("prompt", base + v.make(SPRITE_RULES));
            form.append("size", "1024x1024");
            form.append("quality", "medium");
            form.append("background", "transparent");
            form.append("output_format", "png");
            form.append("n", "1");
            const resp = await fetch("https://api.openai.com/v1/images/edits", {
                method: "POST",
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                body: form,
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json?.error?.message || `HTTP ${resp.status}`);
            const b64 = json?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image came back");
            fs.writeFileSync(path.join(OUT, `${v.id}.png`), Buffer.from(b64, "base64"));
            console.log("ok");
        } catch (e) {
            console.log(`FAILED — ${e.message}`);
        }
    }
    console.log(`\n   written to ${OUT}\n`);
    process.exit(0);
}

main();
