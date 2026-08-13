// One emblem per Pathfinder chapter. Thirteen small die-cut icons in a single visual language, so the guide
// reads as a designed thing rather than thirteen sprites borrowed from thirteen other features.
//
// They are EMBLEMS, not scene art: a single object on transparency, chunky enough to survive at 44px, and each
// one obviously about its system at a glance. No text — a badge with a word on it is a label, not an icon.
//
// Usage:  node scripts/gen-guide-art.mjs [key ...]   (no args = everything missing)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/guide";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game icon, bold clean dark outlines, chunky readable silhouette, high contrast, warm rich colors, soft inner shading, fantasy RPG UI emblem.";
const CUTOUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the object. No text, no words, no letters, no numbers, no logo, no watermark, no border.";
const E = (desc) => `A single centered fantasy game emblem filling most of the frame: ${desc} ${STYLE} ${CUTOUT}`;

const ART = {
    "ch-hero": E("a polished steel adventurer's helm with a gold browguard, three-quarter view, one crest feather"),
    "ch-farm": E("a bursting cloth seed pouch tipped over with green sprouts and a single ripe carrot spilling out"),
    "ch-chests": E("a small iron-bound wooden treasure chest, lid cracked open with warm gold light escaping"),
    "ch-pets": E("a friendly wolf pup sitting upright with an oversized collar and a bone at its paws"),
    "ch-boss": E("a heavy crossed pair of notched battle axes over a cracked round shield"),
    "ch-town": E("a cluster of three tiny stylised village rooftops with a banner pole and a lantern"),
    "ch-sea": E("a wooden ship's wheel with a coiled rope and one blue-green wave curling behind it"),
    "ch-kitchen": E("a bubbling copper cooking pot on a small stone hearth with a wooden spoon and a sprig of herbs"),
    "ch-forge": E("a blacksmith's anvil with a hammer resting on it and three bright orange sparks"),
    "ch-deco": E("a small potted flowering plant beside a tiny painted garden fence post and a hanging lantern"),
    "ch-mine": E("a crossed pickaxe and lantern over a chunk of rock with a glowing amber ore seam"),
    "ch-dungeons": E("a heavy arched dungeon doorway in dark stone with an iron portcullis half raised and a torch burning beside it"),
    // The ring, not a weapon: every other combat chapter is already an axe or a pick, and the Arena is the
    // one place the fight is against a PERSON. A raised gauntlet over a laurel reads as a duel won.
    "ch-arena": E("a raised armoured gauntlet clenched in victory over a crossed gladius and a bronze laurel wreath"),
    "ch-trade": E("two open hands exchanging a gold coin above a small balance scale"),
    "ch-store": E("a paper shopping bag with a trading card and a gold coin peeking out of the top"),
};

const want = process.argv.slice(2);
const keys = Object.keys(ART).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.webp`))));
console.log(`${keys.length} guide emblems to generate`);

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality: "low", n: 1, background: "transparent" }),
            });
            if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 140)}`);
            const b64 = (await r.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((res) => setTimeout(res, 4000 * attempt));
        }
    }
    return null;
}

const queue = [...keys];
let done = 0; const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
        try {
            const buf = await generate(ART[k]);
            const out = path.join(OUT, `${k}.webp`);
            await sharp(buf).resize({ width: 192, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(out);
            done += 1;
            console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb)`);
        } catch (e) {
            failed.push(k);
            console.log(`✗ ${k}: ${e.message}`);
        }
    }
}));
console.log(`\nDONE — ${done}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
