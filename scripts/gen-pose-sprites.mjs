// ── THE POSE SPRITES ────────────────────────────────────────────────────────────────────────────────────────
// One per pose, for the pose SLOT on the equipment doll and the rows in its picker. Luke: "A sprite
// representing the pose, along with the poses rarity color."
//
//   node scripts/gen-pose-sprites.mjs                       # price it and stop
//   node scripts/gen-pose-sprites.mjs --apply --model gpt-image-2.5-flare --only ready,kneel,landing
//
// ⚠️ THREE AT A TIME, IN THE FOREGROUND, AND NEVER MORE WITHOUT LUKE SAYING SO. The cap below is the house
// rule, not a convenience: a set is judged on a contact sheet of three, and a backgrounded run is one he
// cannot stop with a word. See batch-max-three-and-foreground.
//
// ⚠️ THE SUBJECT IS A STANCE, NOT A CHARACTER. These are read at 46px in a slot beside nine gear icons, so
// what has to survive the downscale is the SILHOUETTE — the angle of the body, where the weapon is, whether
// the shield is up. A detailed face at that size is noise, and worse, it would compete with the member's own
// hero standing 200px above it in the same panel. So: one anonymous armoured figure, dark and graphic,
// lit from behind, drawn the way a move-list icon is drawn.
//
// ⚠️ THE POSE TEXT IS THE ONE IN poses.js, NOT A SECOND DESCRIPTION OF IT. `say` is already the sentence the
// hero-sprite prompt uses to place the body, the weapon and the shield, and it has been through six trial
// rounds to get there — Arms Folded was ignored outright until it said where the gear goes. A separate
// wording here would be a second description of the same pose, free to drift from the one the player's own
// hero is actually drawn with. See balance-constants-never-copied.
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { quality, priceRun } from "./lib/gen-guard.mjs";
// Pure data, no imports of its own, so plain node can read it.
import { POSES } from "../src/lib/marketplace/poses.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const OUT = "public/images/poses";
const SIZE = "1024x1024";
const MAX_PER_RUN = 3;

const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const Q = quality();

// ⚠️ NO DEFAULT THAT WORKS. gen-grove-art's note is the rule and this follows it: gpt-image-1 is the house
// style and was retired from the generations endpoint on 2026-10-23, so a run must name its model out loud
// and the choice lands in the shell history of whoever made it. Silently repointing this at whatever happens
// to answer is exactly the swap that note forbids.
const MODEL = arg("--model") || "gpt-image-1";

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
const CUTOUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the figure. No text, no words, no letters, no logo, no watermark, no border.";

// ⚠️ THE MARGIN CLAUSE, AND IT IS NOT OPTIONAL HERE. Half these poses raise a weapon overhead, sweep a cape
// wide or drive a fist into the ground — the exact shapes that get amputated by a frame-filling draw. The
// bosses lost five extremities to this and the fix was to demand the margin and ask for SMALLER rather than
// cropped. See sprite-amputation-vs-clipping.
const FRAME = "Drawn LARGE but ENTIRELY INSIDE the frame with roughly 10% empty space on all four sides: no part of the figure may touch or run off any edge — not a raised weapon, a cape, a banner, an outstretched arm or a trailing foot. Fit the WHOLE figure in view, smaller rather than cropped.";

// ── ROUND TWO: A STANCE ICON, NOT A RENDERED KNIGHT ─────────────────────────────────────────────────────────
// Round one drew three genuinely good knights and all three failed the only test that matters: at 46px they
// read as "a grey knight" and not as kneeling, crouching or braced. Luke has seen the sheet. The faults were
// specific, and each clause below answers one:
//
//   · ARMOUR IS GREY AND SO IS EVERY POSE. Twenty silver knights in one list is one thumbnail twenty times.
//     So the figure is a near-SILHOUETTE now — one flat dark body shape with a bright rim — and what the eye
//     catches is the OUTLINE of the stance rather than the plate on the shoulder.
//   · INTERIOR DETAIL IS NOISE AT 46px. Every rivet survives the downscale as a smudge. Asked for flat,
//     almost no internal shading, and the weapon and shield as clean readable shapes against the body.
//   · FACING WANDERED. Round one gave right, left and head-on across three images despite the prompt asking
//     for right. It goes LAST now, the way describeExpression had to — the end of a long prompt is the part
//     a model weights most, which four trial rounds on the hero sprite established.
const brief = (pose) =>
    `A bold flat STANCE ICON for a game menu: the dark silhouette of an armoured fantasy warrior in ` +
    `${pose.say}. ` +
    `The SHAPE OF THE POSE is the entire subject — this is read at thumbnail size, so the figure is drawn ` +
    `as one solid near-black silhouette with a strong bright rim light along its edge, almost NO internal ` +
    `detail, no rivets, no plate seams, no face, no portrait. The sword and the shield are clean simple ` +
    `shapes that stand clear of the body so the stance stays legible when the image is 46 pixels wide. ` +
    `Graphic, flat and high contrast, like a fighting-game move-list icon. ` +
    `Bold clean dark outlines, two or three tone steps only, fantasy action-RPG style. ` +
    `${FRAME} ${CUTOUT} ` +
    `CRITICAL: the warrior must face and lean toward the RIGHT side of the image — a right-facing ` +
    `side-on three-quarter view, NOT facing forward and NOT facing left.`;

let keys = POSES.map((p) => p.id);
if (ONLY.length) keys = keys.filter((k) => ONLY.includes(k));
if (process.argv.includes("--missing")) {
    const before = keys.length;
    keys = keys.filter((k) => !fs.existsSync(path.join(OUT, `${k}.webp`)));
    console.log(`  --missing: ${before - keys.length} already drawn, ${keys.length} to go`);
}

if (!keys.length) { console.log("nothing to draw"); process.exit(0); }

console.log(`Pose sprites — ${keys.length} of ${POSES.length}: ${keys.join(", ")}`);
console.log(`  model ${MODEL}  quality ${Q}  size ${SIZE}`);
const bill = priceRun({ count: keys.length, size: SIZE, quality: Q });

// ⚠️ THE CAP REFUSES, IT DOES NOT WARN. A warning is a thing you scroll past on the way to a $65 invoice.
if (keys.length > MAX_PER_RUN) {
    console.log(`\nREFUSING: ${keys.length} images in one run. Three at a time, on a contact sheet, Luke's call.`);
    console.log(`Narrow it with --only, or run it ${Math.ceil(keys.length / MAX_PER_RUN)} times.`);
    process.exit(1);
}

if (!APPLY) { console.log("\ndry run — add --apply to draw"); process.exit(0); }
if (!KEY) { console.log("no OPENAI_API_KEY in accounting_app/local.properties"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
let spentTokens = 0;

for (const key of keys) {
    const pose = POSES.find((p) => p.id === key);
    process.stdout.write(`  ${key} (${pose.rarity}) … `);
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: MODEL, prompt: brief(pose), size: SIZE, quality: Q,
            background: "transparent", output_format: "webp", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`FAILED ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) { console.log("FAILED: no image back"); continue; }
    // What it ACTUALLY cost, off the response. priceRun's table is hardcoded for gpt-image-1 and OpenAI
    // publishes no per-image token counts for 2.5, so the estimate above is a guess for any other model.
    const u = data?.usage;
    if (u) spentTokens += u.output_tokens || 0;

    // ⚠️ STRAIGHT TO DISK FROM THE BASE64. storeImage uploads through Vercel Blob, which is dead locally,
    // and editOnce bills OpenAI long before the upload fails — so a storage failure costs exactly as much
    // as a success. See blob-storage-dead-locally-bills-anyway.
    //
    // Trimmed because a die-cut sprite arrives with transparent margin, and the slot sizes to the IMAGE —
    // untrimmed, a figure drawn at 70% of its plate renders at 70% of a 46px box next to gear icons that
    // fill theirs. threshold 6 because "transparent" comes back as alpha 1-2, not 0.
    // ── ⚠️ TRIMMED, THEN PADDED BACK TO A SQUARE ────────────────────────────────────────────────────
    // Round one came back 653x943, 850x781 and 959x726 — a kneel is wide, a stand is tall. The slot is a
    // square box with object-fit: contain, so a trimmed TALL sprite renders visibly smaller than a trimmed
    // WIDE one sitting next to it, and the list reads as inconsistent art rather than as different poses.
    // Trimming is still right (the model leaves a big transparent margin, and untrimmed every figure is a
    // different fraction of its own plate) — but the square has to be put back afterwards so all twenty
    // share one aspect. See sprite-floats-object-fit-contain.
    const trimmed = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 6 }).toBuffer();
    const m = await sharp(trimmed).metadata();
    const side = Math.max(m.width, m.height);
    const bytes = await sharp(trimmed)
        .extend({
            top: Math.floor((side - m.height) / 2), bottom: Math.ceil((side - m.height) / 2),
            left: Math.floor((side - m.width) / 2), right: Math.ceil((side - m.width) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 92 })
        .toBuffer();
    fs.writeFileSync(path.join(OUT, `${key}.webp`), bytes);
    const meta = await sharp(bytes).metadata();
    console.log(`${(bytes.length / 1024).toFixed(0)}kb  ${meta.width}x${meta.height}`
        + (u ? `  ${u.output_tokens} tok` : ""));
}

console.log(`\nestimated $${bill.toFixed(3)}`
    + (spentTokens ? `, actual ~$${((spentTokens * 30) / 1e6).toFixed(4)} at $30/M` : ""));
console.log(`Look at them before drawing any more: ${OUT}`);
