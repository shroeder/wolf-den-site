// THE JEWELS — five kinds, five tiers each, plus the sixth nobody is told about.
//
// Thirty sprites rather than six, because the TIER is the thing you are chasing: a Chipped Ruby and a Flawless
// one are the same stat and a different prize, and if they share a picture the ladder between them is a word
// on a card. The cut carries it — rough broken chip through fully faceted brilliant — while the colour stays
// locked to the kind, so a ruby is a ruby at any tier and a glance tells you both facts at once.
//
// The Wolf's Eye is drawn LAST and differently on purpose: it is the secret sixth (see WOLF_EYE in gems.js),
// so it is not a coloured gemstone at all but a pale stone with something looking back out of it.
//
// Run:  node scripts/gen-gem-sprites.mjs [--force] [--only ruby,wolfeye] [--tiers 1,5]
import fs from "node:fs";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/gems";
fs.mkdirSync(OUT, { recursive: true });

// Verbatim house rules — same ink weight and die-cut contract as every other sprite in the game, so a jewel
// sitting next to a forge part in the same grid matches it.
const HOUSE = "Painterly cel-shaded 2D fantasy game-icon art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border, "
    + "no hands, no jewellery setting, no ring, no necklace, no chain.";

// The five, by colour and character. Written as MATERIALS rather than names — "deep blood-red" survives being
// 40px tall; "ruby" invites the model to draw a ring.
const KINDS = {
    ruby: "a deep blood-red gemstone, crimson with darker red shadows and a bright white glint",
    sapphire: "a deep cobalt-blue gemstone, rich blue with darker navy shadows and a cold white glint",
    emerald: "a vivid green gemstone, emerald green with deep forest shadows and a bright white glint",
    topaz: "a warm golden-amber gemstone, honey-gold with darker amber shadows and a bright white glint",
    amethyst: "a violet-purple gemstone, rich purple with deep indigo shadows and a bright white glint",
};

// The tier IS the cut. Each step is a real jeweller's stage, so the progression reads without a legend.
const TIERS = {
    1: "a ROUGH BROKEN CHIP of it — small, irregular, dull and unpolished, one chipped corner, barely faceted",
    2: "a FLAWED RAW STONE — a lumpy uncut nugget with a few crude flat faces and a visible crack through it",
    3: "a POLISHED CABOCHON — a smooth rounded dome, glossy, with a clean highlight and no facets",
    4: "a BRILLIANT-CUT gem — a proper faceted jewel with many sharp triangular facets and strong highlights",
    5: "a FLAWLESS MASTER-CUT jewel — a large perfectly symmetrical faceted gem, radiant, with crisp light "
        + "refractions and tiny sparkle points around its crown",
};

// The sixth. Not a coloured stone and not on any list — pale, and looking back.
const WOLF_EYE = {
    kind: "a pale bone-white and silver-grey gemstone with a dark vertical slit at its centre like an animal's "
        + "eye, faint iridescent sheen, unsettling and watchful",
    tiers: {
        1: "a rough chipped fragment of it, the slit barely visible",
        2: "a lumpy uncut stone with the slit showing through a crack",
        3: "a smooth polished dome with the dark slit clear at its centre",
        4: "a faceted jewel with the slit sharp and centred, catching the light",
        5: "a large flawless faceted jewel, the slit wide open and unmistakably an EYE, faint cold light "
            + "escaping around it",
    },
};

const arg = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const onlyKinds = arg("--only") ? new Set(arg("--only").split(",")) : null;
const onlyTiers = arg("--tiers") ? new Set(arg("--tiers").split(",").map(Number)) : null;
const FORCE = process.argv.includes("--force");

const jobs = [];
for (const [kind, look] of Object.entries(KINDS)) {
    for (const [tier, cut] of Object.entries(TIERS)) {
        jobs.push({ id: `${kind}_t${tier}`, subject: `${cut}. The stone is ${look}` });
    }
}
for (const [tier, cut] of Object.entries(WOLF_EYE.tiers)) {
    jobs.push({ id: `wolfeye_t${tier}`, subject: `${cut}. The stone is ${WOLF_EYE.kind}` });
}

let made = 0, skipped = 0, failed = 0;
for (const job of jobs) {
    const [kind, tierPart] = job.id.split("_t");
    if (onlyKinds && !onlyKinds.has(kind)) continue;
    if (onlyTiers && !onlyTiers.has(Number(tierPart))) continue;
    const dest = `${OUT}/${job.id}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }

    const prompt = `A single fantasy RPG GEMSTONE game inventory icon: ${job.subject}. `
        + `It is ONLY the loose stone — nothing holds it, nothing is set into it. `
        + `Must read clearly at 40 pixels: few large shapes, strong outline, no fine detail. `
        + `${DIE_CUT} ${HOUSE} ${NEGATIVE}`;

    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent",
            output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { failed += 1; console.log(`  ${job.id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { failed += 1; console.log(`  ${job.id}: no image returned`); continue; }

    // Trimmed first so the stone fills its box — art that arrives with baked-in margin renders small and
    // floating in a grid where every other cell is full-bleed.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${job.id.padEnd(14)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped}, failed ${failed} (--force to redraw)`);
