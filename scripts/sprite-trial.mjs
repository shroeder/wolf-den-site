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

// ⚠️ ROUND ONE AIMED AT THE WRONG THING. It subtracted the house tail's stance and flat-shading
// clauses, which moved the POSE and the RENDERING and left the face identical in all four. Luke:
// "All the ones you showed me, they're all basically still exactly the same problem."
//
// He named the real one: "it's taking their like Gravatar face too seriously... or maybe we need to
// just describe what they look like instead of in terms of the face."
//
// ⚠️ THE REFERENCE IMAGE IS LITERALLY A GRAVATAR. renderAvatarPng draws the member's DiceBear
// `avataaars` — the flat vector cartoon face — into the top 42% of the canvas and hands it to the
// edits endpoint as the SUBJECT, under a prompt that says "keeping the same face". The model is doing
// exactly what it was told. The faces look like Gravatar because they ARE Gravatar, faithfully copied.
//
// That also explains why they used to have personality: gpt-image-1 treated a reference loosely and
// painted a character over it. gpt-image-2.5-sunburst is more obedient, so the same instruction that
// used to read as a hint now reads as a spec.
//
// ⚠️ THERE IS NO TEMPERATURE TO TUNE. The images endpoints take model, size, quality, background,
// output_format and n — no sampling knob of any kind. That avenue is closed, not untried.
//
// So round two tests the REFERENCE, not the rules: describe them instead of showing them.
const DESCRIBE = {
    from: /^Redraw this cartoon avatar as a full-body 2D video-game hero character\. The reference shows only the head and shoulders at the top of the frame — invent and draw the COMPLETE figure head to toe \(torso, arms, hands, legs and feet\), in a/,
    to: "Draw a full-body 2D video-game hero character from the description below — a real face with real expression, not a flat avatar portrait. Draw the COMPLETE figure head to toe (torso, arms, hands, legs and feet), in a",
};

// "keeping the same face... as the reference" is the clause doing the copying. Loosened, not deleted:
// the member still has to be recognisably themselves or it stops being their hero.
const SAME_FACE = /keeping the same face, skin tone, hairstyle and hair color, facial hair, /;
const LIKENESS = "matching the skin tone, hairstyle and hair color, facial hair, ";

// ── ROUND THREE: THE EXPRESSION, IN WORDS ───────────────────────────────────────────
// Round two proved the reference image was doing the copying: drop it and the face comes alive, keep it
// and loosening the words barely moves. But dropping it also drifts the likeness, because the only thing
// left describing the member was describeAvatar — skin, hair, beard, glasses, clothes. No face at all.
//
// The member picks eyes, eyebrows and mouth. Those three fields are nothing but personality and the
// prompt has never mentioned them. describeExpression says them in English now; this tests whether that
// is enough to get the face back without the flat one to copy.
// ── ROUND FOUR: KEEP THE LIKENESS, MOVE THE EXPRESSION TO WHERE IT IS READ ─────────────────
// Round three corrected round two. Dropping the reference image DOES free the face — and it costs the
// member's green beard and his glasses, which survive only when the image is sent. A hero who is not
// recognisably you is not a fix.
//
// So the image stays, and the two things fighting the face get dealt with instead:
//
//   ⚠️ POSITION. avatar-sprite.js's own note on promptExtra says it goes last because "the end of a
//   long prompt is the part a model weights most". The expression sentence was landing mid-prompt,
//   ahead of ~900 words of house rules. Moved to the very end it is the last thing read.
//
//   ⚠️ THE FLAT-SHADING CLAUSE. "two or three tone steps per colour... no hundreds of tiny marks" is
//   a direct instruction not to draw the small marks a face is made of. Round one showed removing it
//   helps; it was never tested together with an expression that the model could actually see.
const VARIANTS = [
    {
        id: "j-expr-last",
        why: "Image kept. Expression moved to the very end, nothing else changed. Isolates position alone.",
        mode: "edits",
        prompt: (base, rules, expr) => base.replace(SAME_FACE, LIKENESS) + rules + expr,
    },
    {
        id: "k-expr-last-unflattened",
        why: "Image kept, expression last, flat-shading clause removed. The combination I expect to win.",
        mode: "edits",
        prompt: (base, rules, expr) => base.replace(SAME_FACE, LIKENESS) + rules.replace(FLAT_FACE, "") + expr,
    },
    {
        id: "l-expr-last-unflattened-unplanted",
        why: "The same, plus the wide-planted-stance clause removed, so the body is free as well as the face.",
        mode: "edits",
        prompt: (base, rules, expr) => base.replace(SAME_FACE, LIKENESS)
            + rules.replace(FLAT_FACE, "").replace(PLANTED, "") + expr,
    },
];

async function main() {
    const { db, editImage, renderAvatarPng, buildSpritePrompt, SPRITE_RULES, describeExpression,
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
    const expr = describeExpression(row.avatar_config);
    console.log(`   expression: ${expr.trim() || "(none)"}`);

    // ⚠️ EVERY TRANSFORM BELOW IS A STRING SURGERY ON A PROMPT THIS SCRIPT DOES NOT OWN. If any of
    // them stops matching, the run would quietly draw the control three times and look like a result.
    const checks = [
        [DESCRIBE.from.test(base), "the opening sentence of buildSpritePrompt"],
        [SAME_FACE.test(base), "the keeping-the-same-face clause"],
        [SPRITE_RULES.includes(FLAT_FACE), "the flat cel shading clause in SPRITE_RULES"],
        [SPRITE_RULES.includes(PLANTED), "the wide-planted-stance clause in SPRITE_RULES"],
    ].filter(([ok]) => !ok);
    if (checks.length) {
        console.log(`\n\u26a0\ufe0f  the prompt changed — these no longer match:`);
        for (const [, what] of checks) console.log(`   ${what}`);
        console.log("   Re-copy them before trusting this run.");
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
            // ⚠️ A "generate" VARIANT SENDS NO AVATAR AT ALL — that is the whole experiment. The house
            // style sheet still rides along as a reference, because the question is whether the FACE
            // improves without the flat one to copy, not whether the art style survives losing its refs.
            const refs = houseStyleRefs();
            const subject = v.mode === "generate" ? null : png;
            if (subject && refs.length) {
                form.append("image[]", new Blob([subject], { type: "image/png" }), "subject.png");
                refs.forEach((b, i) => form.append("image[]", new Blob([b], { type: "image/png" }), `style-${i}.png`));
            } else if (subject) {
                form.append("image", new Blob([subject], { type: "image/png" }), "avatar.png");
            } else {
                refs.forEach((b, i) => form.append("image[]", new Blob([b], { type: "image/png" }), `style-${i}.png`));
            }
            form.append("prompt", v.prompt(base, SPRITE_RULES, expr));
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
