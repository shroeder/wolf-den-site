// ── THE PACK STALL'S VENDOR, DRAWN ───────────────────────────────────────────────────────────────────────────
// Luke, 2026-10-27: "Lol we need a thematic vendor in the casino that sends these packs, not a floating pack
// lol." He was looking at the stall standing in the prize corner with mystery-bag-drawn-600.webp as its
// placeholder — which at cabinet size against a dark room is a black slab, because it is a picture of a black
// foil bag and not a picture of a person.
//
// ── WHY A RACCOON AND NOT ANOTHER FOX ────────────────────────────────────────────────────────────────────────
// Sable, the VIP vendor three arches away, is a russet fox in violet velvet holding an ornate case. A second
// well-dressed merchant with a case would read as her twin working a day shift. So this one is the opposite
// posture on purpose: she is a fence behind a rope and he is a barker at an open stall, sleeves rolled,
// shouting about what is in the bag.
//
// EMERALD AND GOLD, and that is not decoration either. He stands between the Counter's warm gold at one
// shoulder and the Gachapon's primary-coloured capsules at the other; a warm palette would dissolve into the
// first and a bright one would argue with the second. HOUSE_STYLE asks for rich jewel tones and can only
// deliver them if the subject has some — the note in gen-vip-lounge.mjs learned that when a grey animal in
// dark clothes came back monochrome.
//
// ── THREE TAKES, ONE SHEET, LUKE PICKS ───────────────────────────────────────────────────────────────────────
// Not three different characters — three takes of ONE character, because the thing being chosen is the
// drawing and not the concept. Priced before a single call, previewed as a contact sheet, and nothing is
// published until he has looked at it.
//
//   node scripts/gen-pack-stall.mjs              three takes, preview only, into .pack-art/
//   node scripts/gen-pack-stall.mjs --publish=2  ship take 2 as public/images/casino/packs.webp
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality } from "./lib/gen-guard.mjs";
import { drawImage } from "./lib/draw-image.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const PUBLISH = Number((ARGV.find((a) => a.startsWith("--publish="))?.slice(10) || 0));
const TAKES = 3;
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key && !PUBLISH) throw new Error("no OPENAI_API_KEY");

const OUT = path.join(process.cwd(), ".pack-art");
const PUBLIC = path.join(process.cwd(), "public", "images", "casino");
const SIZE = "1024x1536";

// The player's hero is a stocky chibi — big head, short legs. Anybody sharing a floor with them has to be
// built the same way; a realistic figure scaled down reads as a different game standing in it. Copied in
// spirit from gen-vip-lounge.mjs, which is where the floor's two other characters got theirs.
const CHIBI = "Built like a stocky chibi RPG hero sprite: large head, short sturdy body, short legs, "
    + "standing squarely on both feet with the whole body and both feet visible and nothing cropped.";

// ⚠️ THE STALL AND THE VENDOR ARE ONE OBJECT. Every other thing on this floor is a single cut-out that
// stands on the carpet — the moment the stall is its own sprite it has to be positioned against him in CSS,
// at every room width, for ever. One silhouette, one shadow, one thing to place.
//
// ⚠️ AND THE BAGS MUST BE BLACK WITH A GOLD CRESCENT, because they are a real product that is already drawn:
// the member is about to watch mystery-bag-drawn-600.webp come apart in the reveal. A stall hung with
// red-and-white carnival bags would be selling something else.
const PROMPT = housePrompt(
    "A cheerful raccoon showman standing behind a small market stall and facing the viewer, seen head to "
    + "foot. He has a dark bandit mask across his eyes, ringed tail, and wears an EMERALD GREEN tailcoat with "
    + "gold frogging over a striped waistcoat, sleeves rolled to the elbow. One arm is raised holding a "
    + "single sealed BLACK foil pack with a gold crescent-moon crest on it, presenting it to the viewer; the "
    + "other hand rests on the stall. The stall is a small dark-wood counter with a polished brass rail, and "
    + "from a rail above it hang four more of the same black foil packs in a row. A warm lantern on the "
    + "counter lights him from below.",
    { framing: "sprite", extra: `${CHIBI} Emerald green and gold against grey fur — he stands at the end of a `
        + "violet and gold casino hall and must read as the brightest thing in his corner. Showman's grin, "
        + "mid-pitch, leaning slightly forward over the counter." },
);

// ⚠️ THE MODEL CHAIN IS NOT THIS FILE'S BUSINESS — see lib/draw-image.mjs. gpt-image-1 is the house style and
// is tried first on every image; it has been retired since 2026-10-23, so in practice 1.5 draws these and the
// sprite will be a shade busier than Sable and Rolf beside it. `background: transparent` because he is a
// cut-out standing on the carpet, like every other object on this floor.
async function draw(take) {
    const { buf, model } = await drawImage({
        key, prompt: PROMPT, size: SIZE, quality: Q, background: "transparent",
        onFallback: (m) => console.log(`  ${m} unavailable — falling back`),
    });
    fs.writeFileSync(path.join(OUT, `stall-${take}.png`), buf);
    console.log(`  drew take ${take} with ${model}`);
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });

    if (PUBLISH) {
        const src = path.join(OUT, `stall-${PUBLISH}.png`);
        if (!fs.existsSync(src)) throw new Error(`no take ${PUBLISH} at ${src} — draw them first`);
        fs.mkdirSync(PUBLIC, { recursive: true });
        const dest = path.join(PUBLIC, "packs.webp");
        // ⚠️ TRIMMED TO ITS OWN INK. The cabinet box parks its sprite with object-position: bottom, so a
        // transparent margin under his feet would stand him in mid-air — the same gap the note on
        // .cas-mach-body is about.
        await sharp(src).trim().webp({ quality: 90 }).toFile(dest);
        console.log(`published ${dest}`);
        return;
    }

    priceRun({ count: TAKES, size: SIZE, quality: Q });
    for (let i = 1; i <= TAKES; i += 1) await draw(i);

    // The contact sheet. Three separate PNGs is three separate looks; a strip is one — and the whole reason
    // the preview exists is to be judged side by side.
    const w = 420;
    const tiles = [];
    for (let i = 1; i <= TAKES; i += 1) {
        const buf = await sharp(path.join(OUT, `stall-${i}.png`))
            .resize(w, null, { fit: "contain", background: { r: 18, g: 14, b: 26, alpha: 1 } })
            .flatten({ background: { r: 18, g: 14, b: 26 } }).png().toBuffer();
        tiles.push(buf);
    }
    const metas = await Promise.all(tiles.map((b) => sharp(b).metadata()));
    const h = Math.max(...metas.map((m) => m.height));
    await sharp({ create: { width: w * TAKES, height: h, channels: 3, background: { r: 18, g: 14, b: 26 } } })
        .composite(tiles.map((input, i) => ({ input, left: i * w, top: 0 })))
        .png().toFile(path.join(OUT, "stall-sheet.png"));

    console.log(`\nsheet -> .pack-art/stall-sheet.png`);
    console.log("preview only — pick one, then re-run with --publish=<n> to ship exactly that take");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
