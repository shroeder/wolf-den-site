// ── THE ALL HALLOWS' WHEEL ───────────────────────────────────────────────────────────────────────────────────
// Luke, on the first attempt: "it feels like you took the path of least resistance instead of prioritizing the
// spirit of the festivity... You just simply added a couple things in the background and left the wheel alone.
// It looks like you've tried to recolor it. The wheel's the core feature."
//
// He was right. The first pass was a CSS filter over the ordinary disc plus a moon and two pumpkins standing
// beside it — a recolour, not a costume. This paints a real second wheel.
//
//   node scripts/gen-spin-hw-wheel.mjs --dry       print the prompts and the bill, generate nothing
//   node scripts/gen-spin-hw-wheel.mjs             generate the 3 painted parts, then composite
//   node scripts/gen-spin-hw-wheel.mjs hw-pointer  repaint just that part, keep the rest (slugs, as gen-spin-art)
//   node scripts/gen-spin-hw-wheel.mjs --draw      re-composite from the parts already on disk, free
//
// ── WHY THE WEDGES ARE DRAWN AND ONLY THE ORNAMENTS ARE PAINTED ──────────────────────────────────────────────
// This is not a shortcut, it is the house pattern — gen-wheel-disc.mjs did exactly the same for the ordinary
// disc, and for the same reason. wheel-geometry.js is a contract: 20 wedges with dividers at 9° + k·18°, so the
// CENTRES land at 0°, 18°, 36°… landingRotation() parks the won wedge against those angles and iconPos() puts
// the prize sprites on them. An image model does not paint twenty dividers on exact 18° centres — it paints
// nineteen or twenty-one, slightly uneven — and every one of those degrees is the gap between the pointer
// stopping on the prize a member was told they won and the one beside it.
//
// So the geometry is computed and the things that only have to look good are painted:
//   1. hw-hub.png      a carved jack-o-lantern medallion for the centre
//   2. hw-band.png     the ring band: blackened iron, bare branches, candle flames
//   3. hw-pointer.png  the top ornament — composited at dead top BY HAND, see below
//
// ⚠️ THE POINTER IS GENERATED SEPARATELY AND PLACED BY US. The ordinary frame was generated with its wolf head
// in the prompt and the model put it roughly at the top; roughly is fine for a wolf and fatal for a pointer,
// because that chevron IS the marker a member reads to know which wedge won (there is no separate pointer
// element — see the note at .cw-frame). Painting it as its own sprite and compositing it at x = centre means
// it is at dead top because we put it there, not because the model cooperated.
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs";                       // every call lands in the AI Costs history
import { quality, priceRun } from "./lib/gen-guard.mjs";
import { WEDGES, WEDGE_DEG } from "../src/lib/marketplace/wheel-geometry.js";

const DRY = process.argv.includes("--dry");
const DRAW_ONLY = process.argv.includes("--draw");
const Q = quality();

const OUT = "public/images/spin";
const PARTS = "out/hw-wheel";

// ── THE PAINTED PARTS ────────────────────────────────────────────────────────────────────────────────────────
const STYLE = "hand-painted mobile fantasy RPG / trading-card-game art style, rich saturated color, bold clean "
    + "rendering, cohesive with a cozy wolf-themed game. Die-cut on a FULLY TRANSPARENT background — nothing "
    + "behind it, no scene, no ground, no cast shadow. Absolutely NO text, NO words, NO numbers, NO letters.";

const JOBS = [
    {
        slug: "hw-hub",
        prompt: "A single round carved jack-o-lantern face medallion seen straight on, filling the frame as a "
            + "perfect circle — a pumpkin with triangular eyes and a jagged-toothed grin carved into it, lit "
            + "from inside by a candle so the cut-out eyes and mouth glow hot yellow-white and the rind around "
            + "them glows deep ember orange. Thick ribbed pumpkin rind, a small curl of dry vine at the top. "
            + "Ornate, like a carved emblem set into a wheel hub. " + STYLE,
    },
    {
        // Deliberately the SAME shape brief as the gold frame's prompt — a narrow band on the outermost edge
        // with an enormous transparent hole — because the frame's inner rim starting at 0.812 rotor radii is
        // also geometry: it is the number the icon ring's outer limit was derived from.
        slug: "hw-band",
        prompt: "Just a thin decorative CIRCLET sitting exactly on the outermost edge of a square image — like "
            + "a slim porthole rim. The circlet band is extremely narrow (only ~8% of the radius). Everything "
            + "inside is one enormous empty transparent circle (roughly 84% of the image is transparent hole). "
            + "The band is blackened twisted iron overgrown with gnarled bare branches and wisps of cobweb. "
            + "Small guttering ORANGE candle flames are spaced evenly all the way around the band, with a few "
            + "tiny pale-green witch-lights between them. NO ornament, NO head, NO pointer, NO arrow, NO "
            + "triangle, NO marker anywhere on the ring — the band is even all the way around. Fully "
            + "transparent center and transparent outside the ring. " + STYLE,
    },
    {
        slug: "hw-pointer",
        // ⚠️ THE FANG IS SHORT ON PURPOSE AND THE BRIEF SAYS SO TWICE. The tip has to park at 0.78 rotor
        // radii to clear the prize icons, and the whole ornament is scaled to make that true — so every
        // pixel the fang spends is a pixel the HEAD does not get. The first attempt asked for a "long curved
        // fang", came back 307x374, and scaling that until the tip cleared left a crest too small to read as
        // the pointer at the 440px the stage actually renders at.
        prompt: "A single carved jack-o-lantern head facing the viewer, worn as a crest ornament, filling "
            + "almost the whole frame — the pumpkin head is the subject and should be WIDE and LARGE. Below "
            + "its grin hangs one SHORT stubby pale-bone fang ending in a sharp point, no longer than a "
            + "quarter of the head's height. The pumpkin is lit from within, glowing hot orange through its "
            + "carved triangular eyes, with a twist of dry vine at the top and two small bare branches "
            + "curling out to the sides. Compact and bold, not tall or thin. " + STYLE,
    },
];

// Slugs on the command line narrow the run, the way gen-spin-art.mjs does. The composite step always runs on
// everything in out/hw-wheel, so repainting one part and keeping the other two is the cheap way to iterate on
// the piece that is wrong — and the pointer is the piece most likely to need it.
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TODO = ONLY.length ? JOBS.filter((j) => ONLY.includes(j.slug)) : JOBS;
if (ONLY.length && !TODO.length) throw new Error(`no such part: ${ONLY.join(", ")} — have ${JOBS.map((j) => j.slug).join(", ")}`);

const bill = priceRun({ count: TODO.length, size: "1024x1024", quality: Q });
if (DRY) {
    for (const j of JOBS) console.log(`\n── ${j.slug} ──\n${j.prompt}`);
    console.log(`\nNothing generated. The run is $${bill.toFixed(2)}.`);
    process.exit(0);
}

// ── GENERATE ─────────────────────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(PARTS, { recursive: true });

if (!DRAW_ONLY) {
    const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
    const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
    if (!key) throw new Error("no OPENAI_API_KEY");

    for (const j of TODO) {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-image-1", prompt: j.prompt,
                size: "1024x1024", background: "transparent", quality: Q, n: 1,
            }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(`${j.slug}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
        fs.writeFileSync(path.join(PARTS, `${j.slug}.png`), Buffer.from(body.data[0].b64_json, "base64"));
        console.log(`  painted ${j.slug}`);
    }
} else {
    console.log("--draw: compositing from the parts already in out/hw-wheel, no generation.");
}

// ── WEBP, NOT PNG, AND THAT IS NOT A STYLE CHOICE ─────────────────────────────────────────────
// The first composite wrote PNGs and the frame came out at 2.1MB — a painterly ring with a soft alpha edge is
// about the worst case there is for PNG, and this is a file every dressed spin downloads on a phone. The same
// picture is 158KB as WebP and 185KB as a maximum-effort PNG. The gold wheel's own frame is still a 1.6MB PNG,
// and that is not a precedent to match, it is the next thing to fix.
// (Chest art already ships WebP through storeImage, so nothing new is being introduced here.)
// ── THE DISC: 20 EXACT WEDGES ────────────────────────────────────────────────────────────────────────────────
const S = 1024, cx = S / 2, cy = S / 2;
const ROTOR_FRAC = 0.82;             // .cw-rotor { width: 82% } — the disc is this much of the frame
const Rout = S * 0.475;              // same outer radius the gold disc uses, so the frame still fits it
const Rhub = S * 0.135;              // the hub medallion's radius — wheel-geometry's 0.308 rotor radii
const seg = (2 * Math.PI) / WEDGES;

// Pumpkin against witch-purple. Two tones rather than the gold wheel's six jewel colours, because the prize
// sprites sit ON these wedges and keep their own colours — a busy ground is what makes a Mythic and a
// Legendary hard to tell apart at a glance, and the icon is the only thing on this screen that has to be read.
const RIND = ["#e0701a", "#b9520c"];     // lit pumpkin / shadowed pumpkin
const WITCH = ["#43265f", "#2c1745"];    // lit purple / shadowed purple
const BONE = "#efe3cb";

let wedges = "";
for (let i = 0; i < WEDGES; i += 1) {
    // Divider at 12 o'clock and every 18° after it, so wedge i is CENTRED on i*18°. Do not change the phase
    // here without changing WEDGE_OFFSET — the icons and the landing maths read it from the same file.
    const a0 = -Math.PI / 2 - seg / 2 + i * seg, a1 = a0 + seg;
    const x0 = cx + Math.cos(a0) * Rout, y0 = cy + Math.sin(a0) * Rout;
    const x1 = cx + Math.cos(a1) * Rout, y1 = cy + Math.sin(a1) * Rout;
    wedges += `<path d="M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} `
        + `A ${Rout} ${Rout} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" `
        + `fill="url(#g${i % 2})" stroke="${BONE}" stroke-width="4" stroke-opacity="0.55"/>`;
}

// A rib down the centre of each wedge — a pumpkin's lobes. Stops short of the icon ring so it never reads as
// a line through a prize sprite.
let ribs = "";
for (let i = 0; i < WEDGES; i += 1) {
    const a = -Math.PI / 2 + i * seg;
    const r0 = Rhub * 1.08, r1 = Rout * 0.62;
    ribs += `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" `
        + `x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}" `
        + `stroke="#000" stroke-opacity="0.16" stroke-width="7" stroke-linecap="round"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="g0" cx="50%" cy="46%" r="56%">
      <stop offset="0%" stop-color="${RIND[0]}"/><stop offset="100%" stop-color="${RIND[1]}"/></radialGradient>
    <radialGradient id="g1" cx="50%" cy="46%" r="56%">
      <stop offset="0%" stop-color="${WITCH[0]}"/><stop offset="100%" stop-color="${WITCH[1]}"/></radialGradient>
    <radialGradient id="sheen" cx="50%" cy="40%" r="62%">
      <stop offset="0%" stop-color="#ffd9a0" stop-opacity="0.16"/>
      <stop offset="58%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#1a0b22" stop-opacity="0.44"/></radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${Rout + 9}" fill="#1d1226"/>
  ${wedges}
  ${ribs}
  <circle cx="${cx}" cy="${cy}" r="${Rout}" fill="url(#sheen)"/>
  <circle cx="${cx}" cy="${cy}" r="${Rout}" fill="none" stroke="#2a1a33" stroke-width="18"/>
  <circle cx="${cx}" cy="${cy}" r="${Rout - 8}" fill="none" stroke="${BONE}" stroke-width="2.5" stroke-opacity="0.4"/>
  <circle cx="${cx}" cy="${cy}" r="${Rout + 9}" fill="none" stroke="#120a18" stroke-width="4"/>
</svg>`;

const base = await sharp(Buffer.from(svg)).png().toBuffer();

// The painted hub, cut to a circle and dropped in the middle.
const hubSize = Math.round(Rhub * 2.18);
const hubMask = Buffer.from(`<svg width="${hubSize}" height="${hubSize}"><circle cx="${hubSize / 2}" cy="${hubSize / 2}" r="${hubSize / 2 - 1}" fill="white"/></svg>`);
const hub = await sharp(path.join(PARTS, "hw-hub.png"))
    .resize(hubSize, hubSize, { fit: "cover" })
    .composite([{ input: hubMask, blend: "dest-in" }]).png().toBuffer();

// Clip the whole disc round — .cw-disc is border-radius 50% in CSS, but the box-shadow under it is drawn from
// the element box, so a square PNG corner shows as a hard edge inside the glow.
const discMask = Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${cx}" cy="${cy}" r="${Rout + 11}" fill="white"/></svg>`);
await sharp(base)
    .composite([
        { input: hub, top: Math.round(cy - hubSize / 2), left: Math.round(cx - hubSize / 2) },
        { input: discMask, blend: "dest-in" },
    ])
    .webp({ quality: 90, effort: 6 }).toFile(`${OUT}/wheel-disc-hw.webp`);
console.log(`  wrote ${OUT}/wheel-disc-hw.webp — ${WEDGES} wedges, centres at k*${WEDGE_DEG}°`);

// ── THE FRAME: PAINTED BAND + POINTER PLACED AT DEAD TOP ─────────────────────────────────────────────────────
// ⚠️ THE POINTER IS SIZED BY HOW DEEP ITS TIP HANGS, NOT BY HOW WIDE THE HEAD LOOKS. Scaled to a width that
// looked right on its own, the fang reached 0.33 rotor radii — nearly to the hub — and covered the prize
// icons on two whole wedges. So the scale is solved backwards from the one number that matters.
//
// The budget, all in rotor radii (the frame image is the whole STAGE, and .cw-rotor is 82% of it):
//     prize icons are centred at   0.68   (ICON_R 34) and reach 0.74 at their outer edge
//     the frame's inner rim starts 0.812
// Parking the tip at 0.78 puts it between the two: clearly inside the ring so it reads as a pointer aimed at
// the wheel, and clear of every icon so it covers nothing at any moment of the spin. That is better than the
// gold wolf, whose muzzle reaches 0.583 and sits over the won icon — the bug .cw-ring.has-won exists to undo.
const TIP_RADII = 0.78;
const TOP_AIR = 10;                                 // a little space above the vine so it is not flush-cut
const tipY = cy - TIP_RADII * (S * ROTOR_FRAC / 2); // rotor radius in frame pixels
const pointer = await sharp(path.join(PARTS, "hw-pointer.png"))
    .trim({ threshold: 6 })                         // the model leaves transparent margin; the tip must be the edge
    .resize({ height: Math.round(tipY - TOP_AIR) })
    .png().toBuffer();
const pMeta = await sharp(pointer).metadata();

await sharp(path.join(PARTS, "hw-band.png"))
    .resize(S, S, { fit: "cover" })
    .composite([{ input: pointer, left: Math.round(cx - pMeta.width / 2), top: TOP_AIR }])
    .webp({ quality: 90, effort: 6 }).toFile(`${OUT}/wheel-frame-hw.webp`);
console.log(`  wrote ${OUT}/wheel-frame-hw.webp — pointer ${pMeta.width}x${pMeta.height}, tip at ${TIP_RADII} rotor radii`);
console.log(`\n  preview:  node scripts/preview-spin-wheel.mjs hw --icons`);
