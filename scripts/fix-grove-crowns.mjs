// ── GIVE BACK THE HEADS AND ANTLERS THE CANVAS EDGE CUT OFF ──────────────────────────────────────────────────
// Luke, mid boss fight: "The harvest man had a cut off head can u fix along with any other similar issues."
//
//   node scripts/fix-grove-crowns.mjs                       # price it and stop
//   node scripts/fix-grove-crowns.mjs --only harvestman,husk --apply
//   node scripts/fix-grove-crowns.mjs --apply --yes         # all of them
//
// ⚠️ OUTPAINTED, NOT REDRAWN, AND THAT IS THE WHOLE POINT. 44 sprites are clipped and a fresh generation
// would fix every one of them by replacing the creature. These animals have been on screen for weeks; the
// Harvestman is a boss with a name and a zone, and a reroll hands back a DIFFERENT scarecrow wearing it.
// So the existing plate goes in as the image, pinned to the BOTTOM of a taller frame, and the model is asked
// to continue the drawing it can already see into the empty band above. Identity survives; the crown comes
// back.
//
// ⚠️ AND IT COMES BACK SQUARE. The headroom is only worth having if it is still there after delivery, so the
// result is trimmed to its own alpha bounds and re-padded to 1024x1024 with a real margin. Deliver square,
// because canvas fill IS on-stage scale and GROVE_SIZE's h/foot numbers are authored against a square plate
// — see sprite-amputation-vs-clipping.
//
// ⚠️ VERSIONED ON THE WAY OUT. Same path with new bytes means every player keeps the OLD picture for a day.
// This bumps GROVE_ART_V, which every grove art URL already carries. See redrawn-art-must-be-versioned.
import fs from "node:fs";

import sharp from "sharp";

import { quality, priceRun, requirePreview } from "./lib/gen-guard.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const DIR = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const Q = quality();
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);

// The frame the model draws into: the original 1024 wide, with a 512 band of empty sky on top.
// ⚠️ SMALL. A 512px band of empty sky was read as an invitation to reinvent the character — the model used
// it. The content that is actually missing off the top of a clipped sprite is a crown, not a second figure,
// so the band is barely bigger than the thing being restored and there is no room for anything else.
const PAD = 200;
const SIZE = "1024x1536";   // the API's nearest portrait; the frame is letterboxed into it and read back out
const ALPHA = 10;
const MARGIN = 0.045;        // share of the delivered plate left empty above the crown

// Who is cut. Produced by scripts/grove-sprite-amputation.mjs and judged on its contact sheets.
const CUT = `weedcoil pillar_lurk wirecoil husk harvestman heartwood_elder moray wreck_hand sporecrown
drowned_thing rattlerind ember_asp pearl_diver the_drifting_fire oldtimber everburning the_grand_moray
elderling net_caster willow_wisp fen_heron peat_hulk pearl_warden the_gale the_hauler_below the_threshold
the_shard_king the_mason the_warden the_firstborn forge_wraith crystal_stag the_bosun the_elder_rib
silkthroat lumen_drifter the_lantern_below cave_crawler the_picture the_diver the_stack the_caster
cinderback blind_warden`.split(/\s+/).filter(Boolean);

const fileFor = (id) => (fs.existsSync(`${DIR}/boss-${id}.webp`) ? `boss-${id}` : `foe-${id}`);
const pick = CUT.filter((id) => !ONLY.length || ONLY.includes(id));

const bill = priceRun({ count: pick.length, size: SIZE, quality: Q, edit: true });
if (!APPLY) { console.log(pick.map((s) => "  " + s).join("\n")); console.log("\nnothing drawn — re-run with --apply"); process.exit(0); }
requirePreview({ count: pick.length, total: bill });
if (!KEY) { console.error("no OPENAI_API_KEY"); process.exit(1); }

// ── ⚠️ A MASK, AND A PROMPT THAT NAMES NOTHING ──────────────────────────────────────────────────────────────
// The first attempt had neither and produced four different creatures. A maskless edit regenerates the WHOLE
// image -- so the Harvestman came back with a new body -- and a prompt that helpfully listed what might be
// missing ("horns, antlers, hair, flames") was read as a list of things to ADD: it grew a flaming pumpkin
// head, and the Weedcoil, a legless green blob, grew antlers.
//
// So: the mask makes the band above the original the ONLY editable pixels, and the prompt describes the
// operation rather than the subject. It must never name a body part. The drawing underneath is the only
// thing that gets to decide what the top of this creature looks like.
const PROMPT = "The subject in this picture is cut off by a straight horizontal line across the top of the "
    + "lower section. Extend ONLY that subject upward into the empty area above, continuing the exact lines, "
    + "contours and colours that run into the cut so the straight edge disappears and the silhouette closes "
    + "naturally. Invent nothing that is not already begun below the cut. Keep it the same creature. Match "
    + "the line weight, palette and shading exactly. Transparent background.";

let done = 0, failed = [];
for (const id of pick) {
    const name = fileFor(id);
    const src = `${DIR}/${name}.webp`;
    if (!fs.existsSync(src)) { console.log(`${id}: no file`); failed.push(id); continue; }
    process.stdout.write(`${name} … `);

    // ⚠️ READ INTO A BUFFER FIRST. sharp keeps the source file open behind a lazy pipeline, and on Windows
    // writing the result back to that same path fails with an UNKNOWN errno rather than anything that names
    // the problem. Nothing downstream needs the path, so it never gets one.
    const srcBytes = fs.readFileSync(src);

    // The original, pinned to the BOTTOM of a 1024x1536 transparent frame.
    const tall = await sharp({ create: { width: 1024, height: 1024 + PAD, channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: await sharp(srcBytes).resize(1024, 1024, { fit: "fill" }).png().toBuffer(), top: PAD, left: 0 }])
        .png().toBuffer();

    // ⚠️ THE MASK IS WHAT PINS THE BODY. OpenAI edits the TRANSPARENT pixels of the mask and preserves the
    // opaque ones, so this is opaque over the original plate and transparent over the sky band -- plus a
    // small overlap INTO the original so the model has somewhere to blend the join rather than butting a new
    // drawing against an old one at an exact pixel row.
    const OVERLAP = 40;
    const mask = await sharp({ create: { width: 1024, height: 1024 + PAD, channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: await sharp({ create: { width: 1024, height: 1024 - OVERLAP, channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 255 } } }).png().toBuffer(),
            top: PAD + OVERLAP, left: 0 }])
        .png().toBuffer();

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", PROMPT);
    form.append("size", SIZE);
    form.append("quality", Q);
    form.append("background", "transparent");
    form.append("n", "1");
    form.append("image", new Blob([tall], { type: "image/png" }), `${name}.png`);
    form.append("mask", new Blob([mask], { type: "image/png" }), "mask.png");
    const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form,
    }).then((x) => x.json());
    const b64 = r?.data?.[0]?.b64_json;
    if (!b64) { console.log("FAILED", JSON.stringify(r?.error || r).slice(0, 160)); failed.push(id); continue; }

    // ── TRIM TO THE DRAWING, THEN DELIVER SQUARE WITH REAL HEADROOM ─────────────────────────────
    const raw = sharp(Buffer.from(b64, "base64")).ensureAlpha();
    const { data, info } = await raw.raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] > ALPHA) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) { console.log("FAILED (empty)"); failed.push(id); continue; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // ⚠️ THE FIGURE IS SCALED TO THE PLATE'S HEIGHT, NOT FITTED INSIDE IT. The box on stage is square and
    // object-fit: contain, so apparent size is set by how much of the plate's HEIGHT the drawing fills.
    // Fitting a now-taller figure inside a square would shrink every one of these creatures on screen.
    const inner = Math.round(1024 * (1 - MARGIN * 2));
    const scale = inner / bh;
    const w = Math.max(1, Math.round(bw * scale));
    const body = await sharp(Buffer.from(b64, "base64"))
        .extract({ left: x0, top: y0, width: bw, height: bh })
        .resize(w, inner, { fit: "fill" }).png().toBuffer();
    const out = await sharp({ create: { width: 1024, height: 1024, channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: body, left: Math.round((1024 - w) / 2), top: Math.round(1024 * MARGIN) }])
        .webp({ quality: 92 }).toBuffer();
    fs.writeFileSync(src, out);
    console.log(`done  (crown was at y=${y0}, ${Math.round(100 * y0 / info.height)}% down the tall frame)`);
    done += 1;
}
console.log(`\n${done} redrawn, ${failed.length} failed${failed.length ? ": " + failed.join(", ") : ""} — about $${bill.toFixed(2)}`);
console.log("⚠️ bump GROVE_ART_V and re-run grove-sprite-bounds.mjs: the foot padding has changed.");
