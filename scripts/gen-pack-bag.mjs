// ── THE MYSTERY PACK, DRAWN RATHER THAN PHOTOGRAPHED ─────────────────────────────────────────────────────────
// Luke: "Let me see if you can make a sprite or image that digitally resembles this but in our classic style."
//
// What ships today is a cut-out of a PHOTOGRAPH — public/images/packs/mystery-bag-*.webp, made by
// make-pack-art.mjs from a phone picture of the real bag on a carpet. It is accurate and it is the only thing
// on the reveal screen that is not drawn. Everything around it — the card frames, the tier glows, the whole
// marketplace — is the house look, so the bag reads as a photo pasted into a game.
//
// ── WHAT HAS TO SURVIVE THE TRANSLATION ──────────────────────────────────────────────────────────────────────
// This is a REAL OBJECT that members hold in the shop, so the drawing has to be recognisably the same bag:
//
//   · BLACK MATTE, not glossy. The real pouch is dead flat and that is most of its character.
//   · THE GOLD WOLF-IN-MOON, centred, big — a howling wolf's head in profile inside a gold crescent moon.
//   · VERTICAL. Taller than it is wide, zip across the top.
//
// ⚠️ THE EMBLEM IS DESCRIBED AS DRAWN ARTWORK, NEVER AS "A LOGO". NEGATIVE_STYLE bans logos and watermarks —
// correctly, because that is how a model smuggles a signature into the corner — so asking for "the Wolf Den
// logo" asks for the one thing the style forbids. The medallion in gen-bingo-art.mjs has the same problem and
// solves it the same way: describe the mark as a struck emblem and it draws it happily.
//
// ⚠️ THE PHOTOGRAPH IS NOT THE ORIENTATION. In mystery_bag.jpg the bag is LYING ON ITS SIDE on a carpet, and
// the first version of this script read that as landscape and built the whole reveal around it. Luke: "The
// bags are supposed to be vertical." A reference photo shows you the object, not how it stands.
//
// THREE TAKES, because three on a contact sheet is how this gets judged, and because the difference between
// them is a real question nobody can answer by reading a prompt: how much does a flat matte pouch want to be
// sculpted before it stops looking like the thing in the tub?
//
// Run:  node scripts/gen-pack-bag.mjs            draw the three, locally, nothing published
//       node scripts/gen-pack-bag.mjs --publish  ship the one you picked:  --pick=sculpted
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const PUBLISH = ARGV.includes("--publish");
const PICK = ARGV.find((a) => a.startsWith("--pick="))?.slice("--pick=".length) || null;
const Q = quality();

// ⚠️ PORTRAIT. Luke: "The bags are supposed to be vertical."
//
// The photograph this was first drawn from has the bag LYING ON ITS SIDE on a carpet, and I read that as the
// bag's orientation. It is not — the pouch stands upright with its zip across the TOP, which is how a card
// bag is actually sealed and how it hangs.
//
// This is not a cosmetic correction. The whole reveal is built on a card rising vertically out of the bag,
// and with a landscape bag the card had to rise from BEHIND it and pretend. A vertical bag means the card
// comes out of the actual opening, which is what the design asked for in the first place.
const SIZE = "1024x1536";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key && !PUBLISH) throw new Error("no OPENAI_API_KEY in accounting_app/local.properties");

const OUT = path.join(process.cwd(), ".pack-art");
const DEST = path.join(process.cwd(), "public", "images", "packs");

// Shared across all three, so they come back as three takes on ONE bag rather than three different bags.
const BAG = "A sealed resealable foil pouch for trading cards, standing UPRIGHT and seen straight on, in "
    + "PORTRAIT orientation — clearly TALLER THAN IT IS WIDE, roughly 3 units tall to 2 units across, the "
    + "proportions of a card sleeve. A horizontal plastic zip seal runs across the TOP of the pouch. The "
    + "pouch is DEAD MATTE BLACK. Printed large and centred on the face is an emblem in flat gold: the head "
    + "of a howling wolf in profile, facing LEFT, set inside a thick gold crescent moon that rings it, with "
    + "the emblem upright the same way up as the bag.";

// ⚠️ THE FIRST RUN CAME BACK AS GLOSSY 3D PRODUCT RENDERS. NEGATIVE_STYLE already says "not 3D-rendered" and
// gpt-image-1.5 ignored it there — a ban buried in a long tail of negatives carries much less weight than the
// same instruction stated positively in the subject. So the drawing medium is now part of the brief rather
// than a footnote, and the gloss is named as the specific thing to avoid.
const COMMON = "DRAWING MEDIUM, AND THIS MATTERS MOST: a hand-drawn 2D VIDEO GAME ITEM SPRITE — the sort of "
    + "object that sits in an inventory slot beside a treasure chest or a potion. A bold dark near-black INK "
    + "OUTLINE around the whole silhouette and around each major fold, like comic line art. Shading in two or "
    + "three FLAT HARD-EDGED steps of value, painted by hand. "
    + "It must NOT look like a photograph, a 3D render, a studio product shot or shiny packaging mock-up. No "
    + "glossy highlights across the plastic, no specular sheen, no realistic reflections, no blue colour cast "
    + "— the pouch is flat matte black with drawn creases. "
    + "The emblem is FLAT GOLD with no bevel, no gradient chrome and no 3D depth. Keep the wolf's head in "
    + "profile inside the crescent, centred and large enough to read at 300 pixels wide. Absolutely no "
    + "lettering, numerals, brand marks or barcodes anywhere — the wolf-and-crescent is the only marking.";

const JOBS = {
    // 1 — sealed and flat. The reference pose: this is the bag at rest on the reveal screen before a tap.
    flat: {
        file: "bag-flat",
        prompt: housePrompt(
            `${BAG} The pouch is sealed and hangs flat and still, with a few soft drawn creases running down `
            + "from the top seal, lit evenly from the front.",
            { framing: "sprite", extra: `${COMMON} Sealed shut along the top. Minimal volume — a flat hanging `
                + "pouch, not a pillow." }),
    },

    // 2 — the same bag with a card's worth of thickness in it, so it reads as holding something.
    sculpted: {
        file: "bag-sculpted",
        prompt: housePrompt(
            `${BAG} The pouch is gently swollen in the middle where a single card sits inside it, with crisp `
            + "drawn creases fanning out from that bulge toward the corners, and a cool rim light along the "
            + "left edge and the top seal.",
            { framing: "sprite", extra: `${COMMON} The rim light is a thin drawn line on the EDGES only — it `
                + "must not spread across the face or turn the black grey." }),
    },

    // 3 — the moment the reveal animates: the top seal parted, warm light escaping, nothing visible inside.
    opening: {
        file: "bag-opening",
        prompt: housePrompt(
            `${BAG} The zip seal across the top has just been pulled part-way open, the two lips of the `
            + "opening parted into a narrow dark gap, with a thin sliver of warm golden light escaping "
            + "upward from inside it.",
            { framing: "sprite", extra: `${COMMON} The glow is a thin warm line at the opening only. Nothing `
                + "whatsoever is visible inside the gap — no card, no object, no shape, just dark." }),
    },
};

const picked = PICK ? { [PICK]: JOBS[PICK] } : JOBS;
if (PICK && !JOBS[PICK]) throw new Error(`no such take: ${PICK}. One of: ${Object.keys(JOBS).join(", ")}`);

// ⚠️ THE BILL, BEFORE A SINGLE CALL. A number nobody checks is worse than no number — and it is NOT printed
//    on --publish, which draws nothing. Quoting a price for a run that spends nothing is exactly how a number
//    stops being read.
if (!PUBLISH) priceRun({ count: Object.keys(picked).length, size: SIZE, quality: Q });

// ── THE MODEL, AND WHY THERE IS A LIST ──────────────────────────────────────────────────────────────────────
// Luke: "Use the old model, the new ones are just a fallback."
//
// gpt-image-1 IS the house style and stays first, tried on every single image. Everything in the game was
// drawn by it, and a model swap silently restyles every sprite made from here on — which is why it is a
// decision rather than a default, and why this never quietly settles on a newer one.
//
// ⚠️ AS OF 2026-10-27 IT RETURNS 400 AND THE FALLBACK FIRES EVERY TIME. The message is "The model
// 'gpt-image-1' does not exist", which is misleading: /v1/models/gpt-image-1 resolves fine and the key is
// healthy — gpt-image-1-mini and gpt-image-1.5 both draw on it. It is retired for generation and still
// listed. The moment OpenAI restores it, this file goes back to using it with no change at all.
//
// It also records WHICH model drew each image, because a picture whose provenance is unrecorded is one
// nobody can explain the look of six months later.
const MODELS = ["gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini"];
let usedModel = null;
let tokensUsed = 0;

async function draw(name, job) {
    let res = null;
    let body = null;
    let model = null;

    for (const candidate of MODELS) {
        model = candidate;
        res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: candidate,
                prompt: job.prompt,
                size: SIZE,
                quality: Q,
                background: "transparent",
                n: 1,
            }),
        });
        body = await res.json();
        if (res.ok) break;

        // Only a MISSING model falls through. Anything else — a bad prompt, a rate limit, a billing problem —
        // throws, because silently retrying a real error on three models just pays for it three times.
        const msg = String(body?.error?.message || "");
        const missing = res.status === 400 && /does not exist|not have access|deprecated|retired/i.test(msg);
        if (!missing) throw new Error(`${name} (${candidate}): ${JSON.stringify(body?.error || body).slice(0, 300)}`);
        console.log(`  ${candidate} unavailable — falling back`);
    }
    if (!res?.ok) throw new Error(`${name}: every model refused`);

    if (usedModel && usedModel !== model) console.log(`  ⚠️ ${name} drawn by ${model}, not ${usedModel} — MIXED SET`);
    usedModel = model;
    tokensUsed += Number(body?.usage?.output_tokens || 0);

    const buf = Buffer.from(body.data[0].b64_json, "base64");
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${job.file}.png`);
    fs.writeFileSync(file, buf);
    console.log(`  drew ${name} (${model}) -> ${file}`);
    return file;
}

if (!PUBLISH) {
    for (const [name, job] of Object.entries(picked)) await draw(name, job);
    // One contact sheet, because three separate PNGs is three separate looks and a strip is one.
    const files = Object.values(picked).map((j) => path.join(OUT, `${j.file}.png`));
    const W = 520;
    const tiles = await Promise.all(files.map((f) => sharp(f).resize(W).png().toBuffer()));
    const meta = await sharp(tiles[0]).metadata();
    await sharp({
        create: { width: W * tiles.length, height: meta.height, channels: 4, background: { r: 14, g: 14, b: 14, alpha: 1 } },
    })
        .composite(tiles.map((input, i) => ({ input, left: i * W, top: 0 })))
        .png()
        .toFile(path.join(OUT, "contact-sheet.png"));
    // ⚠️ THE REAL BILL, FROM THE API'S OWN USAGE FIGURES. The estimate printed up front uses gpt-image-1's
    //    token table, and a fallback model need not price the same — so what gets reported afterwards is what
    //    was actually billed, never what was predicted.
    if (tokensUsed) {
        console.log(`\n  drawn by ${usedModel} · ${tokensUsed} output tokens · $${(tokensUsed * 40 / 1e6).toFixed(3)} at the gpt-image-1 rate`);
    }
    console.log(`\n  contact sheet: ${path.join(OUT, "contact-sheet.png")}`);
    console.log("  Look at it. Then:  node scripts/gen-pack-bag.mjs --publish --pick=<take>");
} else {
    if (!PICK) throw new Error("--publish needs --pick=<take> — publish the one you looked at, not all three.");
    const src = path.join(OUT, `${JOBS[PICK].file}.png`);
    if (!fs.existsSync(src)) throw new Error(`no preview at ${src} — draw it first.`);
    fs.mkdirSync(DEST, { recursive: true });
    for (const width of [900, 600]) {
        const out = path.join(DEST, `mystery-bag-drawn-${width}.webp`);
        await sharp(src).resize(width).webp({ quality: 88 }).toFile(out);
        console.log(`  published ${out}`);
    }
    // ⚠️ The reveal points at mystery-bag-800/1200.webp. Swapping the FILES would hand everyone a cached
    //    picture of the old one — redrawn art has to be versioned. Point the component at the new names.
    console.log("\n  Now update PackOpenClient to use mystery-bag-drawn-*.webp (new names, so no cache fight).");
}
