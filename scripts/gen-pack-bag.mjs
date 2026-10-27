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
//   · LANDSCAPE, around 1.4:1, with the zip seam running down one side.
//
// ⚠️ THE EMBLEM IS DESCRIBED AS DRAWN ARTWORK, NEVER AS "A LOGO". NEGATIVE_STYLE bans logos and watermarks —
// correctly, because that is how a model smuggles a signature into the corner — so asking for "the Wolf Den
// logo" asks for the one thing the style forbids. The medallion in gen-bingo-art.mjs has the same problem and
// solves it the same way: describe the mark as a struck emblem and it draws it happily.
//
// ⚠️ AND IT STAYS LANDSCAPE. The real bag's zip is down its left edge, so rotating it to put the opening at
// the top would lay the wolf on its side. The reveal has the card rise from BEHIND the bag for exactly this
// reason — see the note in make-pack-art.mjs.
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
const PICK = ARGV.find((a) => a.startsWith("--pick="))?.slice(6) || null;
const Q = quality();

// Landscape, because the bag is. 1536x1024 is 1.5:1 against the real bag's 1.416 — the closest canvas on
// offer, and far closer than a square one. A square plate is what clipped 44 Grove sprites.
const SIZE = "1536x1024";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key && !PUBLISH) throw new Error("no OPENAI_API_KEY in accounting_app/local.properties");

const OUT = path.join(process.cwd(), ".pack-art");
const DEST = path.join(process.cwd(), "public", "images", "packs");

// Shared across all three, so they come back as three takes on ONE bag rather than three different bags.
const BAG = "A sealed resealable foil pouch for trading cards, seen straight on, flat and face-up, in "
    + "landscape orientation about 1.4 times wider than it is tall. The pouch is DEAD MATTE BLACK — no gloss, "
    + "no shine on the plastic itself. A plastic zip seam runs vertically down the left-hand edge. Printed "
    + "large and centred on the face is an emblem in flat metallic gold: the head of a howling wolf in "
    + "profile, facing left, set inside a thick gold crescent moon that rings it.";

const COMMON = "The pouch must stay MATTE BLACK and the emblem FLAT GOLD — those two things are what make it "
    + "this bag and not a generic loot sack. Keep the wolf's head in profile inside the crescent, centred, "
    + "and large enough to read at 300 pixels wide. Absolutely no lettering, numerals, brand marks, barcodes "
    + "or symbols of any kind anywhere on the pouch — the wolf-and-crescent emblem is the only marking.";

const JOBS = {
    // 1 — closest to the photograph. The safe one: if the drawn bag has to sit next to the real product in a
    //     shop photo, this is the one that survives the comparison.
    flat: {
        file: "bag-flat",
        prompt: housePrompt(
            `${BAG} The pouch lies completely flat and smooth with only the faintest creasing, lit evenly from `
            + "the front so the black face reads as one clean matte plane.",
            { framing: "sprite", extra: `${COMMON} Minimal sculpting: this should read as a flat printed pouch, `
                + "not a pillow. A restrained dark ink contour only." }),
    },

    // 2 — the house look applied properly. Faceted cel shading, a real rim light, the bag as an OBJECT with
    //     volume, the way an item sprite in this game is drawn.
    sculpted: {
        file: "bag-sculpted",
        prompt: housePrompt(
            `${BAG} The pouch has real volume — gently swollen in the middle where a card sits inside it, with `
            + "crisp faceted creases running out from the centre toward the corners, and a cool specular rim "
            + "light catching the upper and left edges against the matte black.",
            { framing: "sprite", extra: `${COMMON} Lean into the house look: bold dark ink contour, two or `
                + "three hard-edged value steps across the black, cool-toned shadow and a warm gold bounce "
                + "from the emblem. Still matte — the rim light is on the EDGES, not across the face." }),
    },

    // 3 — the one with a bit of theatre in it. The same bag, caught with the seal just parted and a sliver of
    //     warm light escaping, which is the exact moment the reveal animates.
    opening: {
        file: "bag-opening",
        prompt: housePrompt(
            `${BAG} The top seam has just been parted a little, and a thin sliver of warm golden light escapes `
            + "from inside the opening, spilling faintly up over the top edge of the pouch.",
            { framing: "sprite", extra: `${COMMON} The glow is a thin warm line at the opening only — it must `
                + "not wash over the face of the pouch or turn the black grey, and nothing may be visible "
                + "inside the bag. No card, no object, no shape in the gap." }),
    },
};

const picked = PICK ? { [PICK]: JOBS[PICK] } : JOBS;
if (PICK && !JOBS[PICK]) throw new Error(`no such take: ${PICK}. One of: ${Object.keys(JOBS).join(", ")}`);

// ⚠️ THE BILL, BEFORE A SINGLE CALL. A number nobody checks is worse than no number.
priceRun({ count: Object.keys(picked).length, size: SIZE, quality: Q });

async function draw(name, job) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "gpt-image-1",
            prompt: job.prompt,
            size: SIZE,
            quality: Q,
            background: "transparent",
            n: 1,
        }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${name}: ${JSON.stringify(body?.error || body).slice(0, 300)}`);
    const buf = Buffer.from(body.data[0].b64_json, "base64");
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${job.file}.png`);
    fs.writeFileSync(file, buf);
    console.log(`  drew ${name} -> ${file}`);
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
    console.log(`\n  contact sheet: ${path.join(OUT, "contact-sheet.png")}`);
    console.log("  Look at it. Then:  node scripts/gen-pack-bag.mjs --publish --pick=<take>");
} else {
    if (!PICK) throw new Error("--publish needs --pick=<take> — publish the one you looked at, not all three.");
    const src = path.join(OUT, `${JOBS[PICK].file}.png`);
    if (!fs.existsSync(src)) throw new Error(`no preview at ${src} — draw it first.`);
    fs.mkdirSync(DEST, { recursive: true });
    for (const width of [1200, 800]) {
        const out = path.join(DEST, `mystery-bag-drawn-${width}.webp`);
        await sharp(src).resize(width).webp({ quality: 88 }).toFile(out);
        console.log(`  published ${out}`);
    }
    // ⚠️ The reveal points at mystery-bag-800/1200.webp. Swapping the FILES would hand everyone a cached
    //    picture of the old one — redrawn art has to be versioned. Point the component at the new names.
    console.log("\n  Now update PackOpenClient to use mystery-bag-drawn-*.webp (new names, so no cache fight).");
}
