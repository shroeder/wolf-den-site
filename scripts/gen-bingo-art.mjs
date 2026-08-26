// ── THE HALL, DRAWN ──────────────────────────────────────────────────────────────────────────────────────────
// Luke: "bingo needs a lot more generated sprites and flavor."
//
// He is right, and the reason is worth writing down. Every other machine on this floor is a PLACE — the slots
// have painted cabinets, the keno hall has a hopper, the lounge has two characters standing in it. Bingo had
// one dragon and, for everything else, CSS: the balls were rounded rectangles with a number in them, a daubed
// square was a pink rectangle, and the free space was the character ★. That is a spreadsheet with a bonus.
//
// EIGHT SPRITES, and each one replaces something that was a coloured box:
//
//   FIVE BALLS      one per column, in the five colours a bingo ball has actually been for eighty years.
//                   Drawn BLANK — with a clean ivory face and nothing on it — because the number is put on
//                   in CSS. Seventy-five numbers cannot be generated, and a ball whose number is baked in is
//                   a ball that can only ever be called once.
//   THE DAUB        what covers a square you have. A dauber's ink blot, not a fill: the whole charm of a
//                   bingo card is that it is a piece of paper somebody has marked.
//   THE FREE SPACE  the middle square. It was a ★ from the font. It is the Den's own mark now.
//   THE CALLER      who is running the room. He goes beside the line at the top of the hall that already
//                   existed, so he costs nothing in height — which matters on this screen more than most,
//                   because the card is already taller than a phone.
//
// ── WHY THE BALLS ARE THE HARD ONE ───────────────────────────────────────────────────────────────────────────
// They are drawn at 22px on the called-balls strip. At that size a sphere with a face on it is four pixels of
// face, so the ask is deliberately blunt: one saturated colour, one big ivory disc, one highlight, and no
// interior detail at all. The face has to be CENTRED and EMPTY — the number lands on it from CSS, and a ball
// whose face is off-centre puts every number off-centre with it.
//
// ── THE STYLE COMES FROM art-style.js ────────────────────────────────────────────────────────────────────────
// Subject only. housePrompt() brings DIE_CUT, HOUSE_STYLE and NEGATIVE_STYLE — the last of which already bans
// lettering, which is exactly what a blank ball needs.
//
// Run:  node scripts/gen-bingo-art.mjs               preview, local PNGs only
//       node scripts/gen-bingo-art.mjs --apply       draw AND publish
//       node scripts/gen-bingo-art.mjs --publish     ship the previews you already looked at
//       node scripts/gen-bingo-art.mjs --only=ball-b,daub
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const PUBLISH = ARGV.includes("--publish");
const ONLY = (ARGV.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key && !PUBLISH) throw new Error("no OPENAI_API_KEY");

const OUT = path.join(process.cwd(), ".bingo-art");
const DEST = path.join(process.cwd(), "public", "images", "casino", "bingo");

// Read at 22px on the strip. That is the whole brief.
const TINY = "It must read clearly at 22 pixels wide: one bold silhouette, one dominant colour, a single "
    + "soft highlight, and no interior detail whatsoever — anything finer turns to mush at that size.";

// One description, five colours. Written once so the five come back as a SET rather than as five balls that
// happen to be in the same game — the thing a contact sheet always catches too late.
const ball = (colour, tone) => ({
    dir: DEST, file: `ball-${colour}`, ext: "webp",
    prompt: housePrompt(
        `A classic bingo ball: a glossy ${tone} sphere seen straight on, with a large flat circular ivory-white `
        + "face filling the middle of it, and a soft white highlight on the upper left of the sphere. The ivory "
        + "face is completely blank.",
        { framing: "sprite", extra: `${TINY} The ivory face must be perfectly centred, perfectly circular and `
            + "COMPLETELY EMPTY — no number, no letter, no digit, no symbol, no mark of any kind on it or "
            + `anywhere else on the ball. Saturated ${tone} and clean ivory, nothing else in frame.` }),
});

const JOBS = {
    // ── THE FIVE BALLS ───────────────────────────────────────────────────────────
    // The colours are the traditional ones — B blue, I red, N white, G green, O amber — because a bingo ball
    // is one of the few objects in this game somebody already knows the palette of, and inventing a new one
    // buys nothing. N is silver-grey rather than white: a white sphere with a white face has no silhouette.
    "ball-b": ball("b", "deep royal blue"),
    "ball-i": ball("i", "rich crimson red"),
    "ball-n": ball("n", "cool silver-grey"),
    "ball-g": ball("g", "deep emerald green"),
    "ball-o": ball("o", "warm amber orange"),

    // ── THE DAUB ─────────────────────────────────────────────────────────────────
    // Laid over a square you hold, at about 56px. Round, soft-edged and slightly uneven, because the point of
    // it is that a hand did it — a clean circle is a fill, and we already had a fill.
    daub: {
        dir: DEST, file: "daub", ext: "webp",
        prompt: housePrompt(
            "A single round blot of translucent magenta-pink dauber ink stamped onto paper, its edge soft and "
            + "slightly uneven with a few tiny specks of spatter around it, denser at the rim than in the middle.",
            { framing: "sprite", extra: `${TINY} One flat magenta-pink blot and nothing else — no paper, no `
                + "card, no grid, no border, no dauber, no hand. Just the mark." }),
    },

    // ── THE FREE SPACE ───────────────────────────────────────────────────────────
    // The middle square is free on every card ever printed, and it is the one square the house gets to sign.
    free: {
        dir: DEST, file: "free", ext: "webp",
        prompt: housePrompt(
            "A gold medallion struck with the head of a howling wolf in profile, ringed by a plain raised gold "
            + "border, catching a warm light.",
            { framing: "sprite", extra: `${TINY} Warm gold on a dark wolf silhouette. No lettering, numerals or `
                + "symbols anywhere on the medallion." }),
    },

    // ── THE CALLER ───────────────────────────────────────────────────────────────
    // The room has a voice now (see CALLS in bingo-kit.js) and a voice needs somebody to be. A badger because
    // the two characters the lounge already has are a wolf and a fox, and a third of either would read as one
    // of them; because a badger is built like somebody who has run a bingo hall for thirty years; and because
    // the striped head is a silhouette that survives being 40 pixels tall.
    caller: {
        dir: DEST, file: "caller", ext: "webp",
        prompt: housePrompt(
            "A stout, genial badger standing behind a lectern-less microphone, wearing a burgundy waistcoat "
            + "over a white shirt with the sleeves rolled up and a pair of small round spectacles, one paw "
            + "raised mid-call, holding a brass microphone in the other. Shown from the waist up, facing "
            + "slightly to the left.",
            { framing: "sprite", extra: "Warm burgundy and brass against the badger's black-and-white striped "
                + "head. It must read at 40 pixels tall: bold silhouette, no fine detail, no background, no "
                + "text, no numbers, no bingo cards or balls in frame." }),
    },
};

async function draw(prompt) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt, size: "1024x1024", quality: Q, background: "transparent", n: 1,
        }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
    return Buffer.from(j.data[0].b64_json, "base64");
}

// The preview folder is what --publish ships, so what goes live is what was looked at. Same rule as every
// other generator in here.
async function main() {
    const names = Object.keys(JOBS).filter((n) => !ONLY.length || ONLY.includes(n));
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(DEST, { recursive: true });

    if (!PUBLISH) {
        priceRun({ count: names.length, size: "1024x1024", quality: Q });
        for (const n of names) {
            const buf = await draw(JOBS[n].prompt);
            fs.writeFileSync(path.join(OUT, `${n}.png`), buf);
            console.log(`drew ${n} -> ${n}.png`);
        }
    }

    if (APPLY || PUBLISH) {
        for (const n of names) {
            const src = path.join(OUT, `${n}.png`);
            if (!fs.existsSync(src)) { console.log(`skip ${n} — no preview`); continue; }
            const j = JOBS[n];
            // 512 is twice the largest size any of these is drawn at, which is the standard for this set.
            await sharp(src).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 92 }).toFile(path.join(j.dir, `${j.file}.${j.ext}`));
            console.log(`published ${path.join(j.dir, `${j.file}.${j.ext}`)}`);
        }
    } else {
        console.log("\npreview only — look at them, then re-run with --publish to ship exactly those");
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
