// ── THE VAULT, PAINTED ───────────────────────────────────────────────────────────────────────────────────────
// Luke, looking at what I shipped against the reference cabinet: "Right now what I'm looking at looks very
// web UI, and what I'm hoping for is gamified, dopamine-inducing slot machine type of stuff... I just feel
// like you're taking the bare minimum effort here."
//
// He is right and it is worth writing down exactly HOW he is right, because it is a mistake with a shape.
// The reference is made of OBJECTS: a chrome banner with stars bolted to each end, recessed LED windows with
// real bezels, gold-framed cells sitting on red velvet, jewellery you could pick up. I built the same
// information out of `border-radius`, `rgba()` and a gradient — which is a settings panel wearing a casino's
// vocabulary. Every one of those CSS boxes is a place where the reference has a thing that was drawn.
//
// So these six are the things that were drawn. They are deliberately FURNITURE rather than icons: a plate a
// number sits in, a cover a finger lands on, a backdrop the whole bonus stands on. Which is why several ask
// for a blank centre — the number goes on top in the DOM, so the art must leave room for it and must not try
// to say anything itself.
//
// Run:  node scripts/gen-vault-art.mjs                # preview only, writes .vault-art/
//       node scripts/gen-vault-art.mjs --apply        # generate AND write into public/images/casino/vault/
//       node scripts/gen-vault-art.mjs --publish      # ship exactly the PNGs you already looked at
import fs from "node:fs";

import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality, requirePreview } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const PUBLISH = ARGV.includes("--publish");
const ONLY = (ARGV.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key && !PUBLISH) throw new Error("no OPENAI_API_KEY");

const PREVIEW = ".vault-art";
const OUT = "public/images/casino/vault";

// ── THE ASSETS ───────────────────────────────────────────────────────────────────────────────────────────────
// `wide` ones are drawn 1536x1024 because they are banners and backdrops, and a square asked to be a banner
// comes back as a square with a banner drawn small in the middle of it.
const ART = {
    // ── THE METER ────────────────────────────────────────────────────────────────────────────────────────
    // The reference bar is a bolted-on marquee: brushed blue steel, a row of chrome stars along each side of
    // the title, rivets at the corners. Blank in the middle because "WIN IT AGAIN" is live text over the top.
    // ── A CLUSTER OF STARS, NOT A PLATE WITH A HOLE IN IT ────────────────────────────────────────────
    // The first version of this asked for a marquee plaque with "a completely EMPTY blank panel across the
    // middle third". It came back with a goblin standing in the middle of it. That is not the model being
    // difficult — it is the wrong instruction: an image model fills space, and asking it to leave a hole in
    // the centre of a thing is asking for the one composition it has no reason to produce.
    //
    // So the bar is CSS (a brushed steel gradient is a thing CSS is genuinely good at) and the ORNAMENT is
    // the sprite. Three chrome stars, die-cut, mirrored at both ends of the title — which is what actually
    // reads on the reference cabinet anyway.
    "wa-stars": {
        prompt: housePrompt(
            "A tight cluster of three five-pointed chrome stars of different sizes, bolted together at slight "
            + "angles, polished mirror-bright with cold blue reflections and a hot white specular glint on "
            + "each upper point",
            { framing: "sprite",
                extra: "Seen straight on and flat to the viewer. Cold chrome and steel blue only. Wider than "
                    + "tall. Must read clearly at 40 pixels wide." }),
    },
    // A single recessed window for one slot of the row. Drawn EMPTY and dark: the amount is DOM text on top,
    // and a number baked into the art is a number that is wrong the moment somebody wins.
    "wa-cell": {
        prompt: housePrompt(
            "A small rectangular recessed instrument window set into a brushed blue-steel panel, with a "
            + "polished chrome bezel around it and a deep empty black glass face, unlit and switched off",
            { framing: "sprite",
                extra: "Seen straight on and flat to the viewer. The glass face is EMPTY and very dark — no "
                    + "digits, no segments, no reflection of anything. Slightly wider than tall." }),
    },
    // The same window blazing. A separate asset rather than a CSS filter because the reference's lit cell is a
    // different object — the bezel throws light onto the panel around it, which no filter on the dark one gives.
    "wa-cell-lit": {
        prompt: housePrompt(
            "A small rectangular recessed instrument window set into a brushed blue-steel panel, its polished "
            + "chrome bezel blazing with hot golden light and its glass face glowing bright amber-white from "
            + "within, throwing warm light onto the metal around it",
            { framing: "sprite",
                extra: "Seen straight on and flat to the viewer. The glowing face is EMPTY — no digits, no "
                    + "segments, no symbols. Slightly wider than tall." }),
    },

    // ── THE GEM VAULT ────────────────────────────────────────────────────────────────────────────────────
    // The reference bonus stands on red velvet in a gold frame, and that single choice is most of why it
    // feels expensive. Ours is a vault, so it is a vault door's interior: dark polished stone, deep red
    // velvet lining, brass everywhere.
    "gv-room": {
        wide: true,
        prompt: housePrompt(
            "The inside of a grand treasure vault: a deep crimson velvet-lined back wall in soft folds, framed "
            + "by heavy polished brass pillars and an ornate brass cornice, warm lamplight pooling from above "
            + "and the corners falling into deep shadow, with the centre of the wall left clear and uncluttered",
            { framing: "scene",
                extra: "Portrait orientation, seen straight on. Rich crimson and warm brass against deep "
                    + "shadow. The middle of the image must stay simple and uncluttered — panels are laid over "
                    + "it — so keep all detail and ornament to the outer edges." }),
    },
    // THE STAR OF THE SHOW. Twenty-four of these on screen at once, and it is the thing a finger lands on, so
    // it carries the most weight of anything here: an unopened cover has to look like it is worth opening.
    "gv-cover": {
        prompt: housePrompt(
            "An ornate square safe-deposit box door of polished brass, its face framed by an engraved scrolled "
            + "border, a small round wolf-head medallion boss at its centre and a keyhole beneath it, closed "
            + "and gleaming",
            { framing: "sprite",
                extra: "Square, seen straight on and flat to the viewer with no perspective. Warm polished "
                    + "brass and dark antique bronze in the engraving, one crisp highlight running along the "
                    + "top edge. Must read clearly at 80 pixels wide." }),
    },
    // A cover that has been opened — the setting a revealed stone sits in. Empty in the middle for the gem.
    "gv-open": {
        prompt: housePrompt(
            "An ornate square safe-deposit box frame of polished brass standing OPEN and empty, its engraved "
            + "scrolled border surrounding a deep dark velvet-lined recess with nothing inside it",
            { framing: "sprite",
                extra: "Square, seen straight on and flat to the viewer with no perspective. The recess in the "
                    + "middle must be EMPTY and dark — nothing sitting in it, no jewel, no coin, no object of "
                    + "any kind. Warm brass frame, deep crimson velvet lining." }),
    },
    // The prize trays along the bottom — a jeweller's display plaque the stone is presented on.
    "gv-tray": {
        prompt: housePrompt(
            "A small ornate brass jeweller's display plaque with a scrolled engraved edge and a shallow "
            + "crimson velvet cushion set into its face, completely empty with nothing resting on it",
            { framing: "sprite",
                extra: "Seen straight on and flat to the viewer, slightly taller than wide. The velvet cushion "
                    + "must be EMPTY — no jewel, no ring, no stone, no object on it at all." }),
    },
};

const names = Object.keys(ART).filter((k) => !ONLY.length || ONLY.includes(k));
fs.mkdirSync(PREVIEW, { recursive: true });

// ── TRIMMED, THEN SIZED ──────────────────────────────────────────────────────────────────────────────────
// A die-cut sprite comes back on a 1024px canvas with the subject somewhere in the middle, so shipping the
// raw file ships mostly empty pixels — 2MB apiece, 13MB for the set — and worse, every asset lands at a
// different SIZE on screen depending on how much margin the model happened to leave. Trim to the ink, then
// put each one on a known box. The room is NOT trimmed: it is a full-bleed backdrop and its edges are the art.
const PX = { "wa-stars": 256, "wa-cell": 384, "wa-cell-lit": 384, "gv-cover": 320, "gv-open": 320, "gv-tray": 256 };
async function shipped(k, src) {
    if (ART[k].wide) return sharp(src).resize(768, 1152, { fit: "cover" }).png().toBuffer();
    const t = await sharp(src).trim({ threshold: 10 }).png().toBuffer();
    const px = PX[k] || 320;
    return sharp(t).resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

if (PUBLISH) {
    fs.mkdirSync(OUT, { recursive: true });
    let n = 0;
    for (const k of names) {
        const src = `${PREVIEW}/${k}.png`;
        if (!fs.existsSync(src)) { console.log("skip (no preview):", k); continue; }
        fs.writeFileSync(`${OUT}/${k}.png`, await shipped(k, src));
        n += 1;
        console.log("published", k, `${(fs.statSync(`${OUT}/${k}.png`).size / 1024).toFixed(0)}kb`);
    }
    console.log(`\n${n} file(s) into ${OUT}`);
    process.exit(0);
}

const bill = priceRun({ count: names.length, quality: Q });
if (APPLY) requirePreview({ count: names.length, total: bill });

for (const k of names) {
    const a = ART[k];
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: a.prompt,
            size: a.wide ? "1536x1024" : "1024x1024",
            background: a.wide && k === "gv-room" ? "opaque" : "transparent",
            quality: Q, n: 1,
        }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(`${PREVIEW}/${k}.png`, Buffer.from(b64, "base64"));
    console.log("drew", k);
}

if (APPLY) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const k of names) fs.writeFileSync(`${OUT}/${k}.png`, await shipped(k, `${PREVIEW}/${k}.png`));
    console.log(`\napplied ${names.length} file(s) into ${OUT}`);
} else {
    console.log(`\nPREVIEW ONLY — look at ${PREVIEW}/ then re-run with --publish to ship exactly those.`);
}
