// ── WHAT THE COUNTER SELLS, DRAWN ────────────────────────────────────────────────────────────────────────────
// Luke: "generate the sprites we need for all of this, including the unlock items in the casino shop."
//
// Ten objects, in two places:
//
//   FOUR TRAINING TOOLS   the permanent stat tracks. Each one has to read as a THING YOU USE ON YOURSELF
//                         rather than a stat icon — a whetstone, not a sword; a shield's brace, not a shield.
//                         The Counter sells them at 46px, so each is one silhouette with one strong colour.
//   FOUR DOORS            the unlocks. These are the expensive ones and each has to look like the KEY to
//                         something rather than the something: a chart case, a bound book, a milestone.
//   TWO CHESTS            chest-iron and chest-mythic, for the golden wheel's wedges. The wheel already has
//                         chest-wood and chest-gold and these two have to sit in that set, so their prompts
//                         are deliberately built off the same description with the material swapped.
//
// ── THE STYLE COMES FROM art-style.js ────────────────────────────────────────────────────────────────────────
// Subject only. housePrompt() brings DIE_CUT (isolated, transparent, 8% margin, nothing touching an edge),
// HOUSE_STYLE and NEGATIVE_STYLE (which bans the sticker rim and any lettering). Writing style prose in here
// is the mistake gen-vip-lounge.mjs made and had to be rewritten for.
//
// Run:  node scripts/gen-casino-perks.mjs             preview, local PNGs only
//       node scripts/gen-casino-perks.mjs --apply     draw AND publish
//       node scripts/gen-casino-perks.mjs --publish   ship the previews you already looked at
//       node scripts/gen-casino-perks.mjs --only=road,book
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

const OUT = path.join(process.cwd(), ".perk-art");
const PERKS = path.join(process.cwd(), "public", "images", "casino", "perks");
const PRIZES = path.join(process.cwd(), "public", "images", "spin", "prizes");

// Every one of these is read at 46px on the shelf and 120px in the inspect panel. That is the whole brief:
// one object, one silhouette, one dominant colour, nothing that needs to be squinted at.
const SMALL = "A single object on its own, centred, lit warmly from the upper left with a soft rim light. "
    + "It must read clearly at 46 pixels wide: one bold silhouette, one dominant colour, no fine detail that "
    + "would turn to mush when shrunk.";

// The wheel's existing two chests are the reference set these have to join.
const CHEST = "A closed fantasy treasure chest seen three-quarters on, lid domed, heavy lock plate on the "
    + "front, banded corners, sitting square. Game icon proportions: chunky, readable, slightly stylised.";

const JOBS = {
    // ── THE FOUR TRAINING TOOLS ──────────────────────────────────────────────────
    whetstone: {
        dir: PERKS, file: "whetstone", ext: "webp",
        prompt: housePrompt(
            "A well-used sharpening whetstone on a small oak block, with a curl of bright orange sparks "
            + "coming off its top edge where a blade has just passed. A leather strop is wound round one end.",
            { framing: "sprite", extra: `${SMALL} Warm grey stone, oak, and a hot orange spark spray.` }),
    },
    constitution: {
        dir: PERKS, file: "constitution", ext: "webp",
        prompt: housePrompt(
            "A heavy stoppered flask of deep red vitality tonic in a bronze harness, thick glass, a broad "
            + "base, glowing softly from within, with a wolf crest stamped into the bronze collar.",
            { framing: "sprite", extra: `${SMALL} Deep crimson glass and warm bronze.` }),
    },
    bulwark: {
        dir: PERKS, file: "bulwark", ext: "webp",
        prompt: housePrompt(
            "A thick iron pauldron and bracer set standing upright together, heavily riveted, with a "
            + "reinforcing brace bolted across the shoulder plate and a steel-blue sheen on the metal.",
            { framing: "sprite", extra: `${SMALL} Cold steel blue with dark iron shadow.` }),
    },
    bloodrush: {
        dir: PERKS, file: "bloodrush", ext: "webp",
        prompt: housePrompt(
            "A pair of crossed spurred gauntlet claws wrapped in red cord, wreathed in a low curl of "
            + "crimson energy, as though they are about to move on their own.",
            { framing: "sprite", extra: `${SMALL} Blood red and dark steel, with a crimson energy curl.` }),
    },

    // ── THE FOUR DOORS ───────────────────────────────────────────────────────────
    // Each is the KEY to a thing, not the thing. A miniature prize wheel would just be the wheel screen
    // shrunk; a golden wheel TOKEN is something you buy and carry to it.
    // ── AND THE WHEEL IS A WHEEL AGAIN ───────────────────────────────────────────
    // Luke: "that sprite needs a rework." The first pass asked for a TOKEN struck with a wheel on its face,
    // on the reasoning that a door should be the key rather than the thing. The reasoning was fine and the
    // picture was not: struck relief on a coin is shallow by definition, so it came back as a flat gold disc
    // with some spokes scratched into it, and at 46px it read as a cart wheel — the one object in the set
    // with no colour of its own and no idea what it was for.
    //
    // So it is the wheel itself, three-quarters on and standing, which is a silhouette rather than a circle.
    // The jewelled segments give it the colour the disc never had, and the pointer at the top is what says
    // "prize wheel" instantly at any size.
    "wheel-gold": {
        dir: PERKS, file: "wheel-gold", ext: "webp",
        prompt: housePrompt(
            "An ornate golden fortune wheel standing upright on a short gilded base, seen three-quarters "
            + "on so its face is an oval rather than a flat circle. Its face is divided into wedges of deep "
            + "ruby, sapphire and emerald enamel between raised gold spokes, its outer rim is set with small "
            + "warm-glowing bulbs, and a gold pointer sits at the very top of the rim. A few loose sparks "
            + "come off the rim as though it has just been spun.",
            { framing: "sprite", extra: `${SMALL} Rich gold with jewelled ruby, sapphire and emerald wedges `
                + "and a warm bulb glow. The wedges must be plain colour: no lettering, numerals, symbols or "
                + "prize icons anywhere on the wheel." }),
    },
    charts: {
        dir: PERKS, file: "charts", ext: "webp",
        prompt: housePrompt(
            "A brass-cornered navigator's chart case lying open, with two rolled sea charts spilling out of "
            + "it, a small brass sounding weight on a cord, and a sliver of deep blue-green abyssal light "
            + "coming up out of the open case.",
            { framing: "sprite", extra: `${SMALL} Aged parchment, weathered brass, and a cold blue-green glow. `
                + "The charts must be blank paper with no writing, symbols or lettering on them." }),
    },
    book: {
        dir: PERKS, file: "book", ext: "webp",
        prompt: housePrompt(
            "A thick leather-bound master cook's recipe book, closed, with brass corner guards, a heavy "
            + "clasp, a scorched and spattered cover, and a red ribbon marker hanging from the pages. A "
            + "faint warm orange light leaks from between the closed pages.",
            { framing: "sprite", extra: `${SMALL} Deep oxblood leather and warm brass, with an orange glow at the page edges. `
                + "The cover must be plain leather with no title, lettering or writing on it." }),
    },
    road: {
        dir: PERKS, file: "road", ext: "webp",
        prompt: housePrompt(
            "A tall weathered stone waymarker standing on a fragment of old flagstone road, chipped and "
            + "lichen-spotted, leaning very slightly. A worn arrow is carved into its face pointing upward, "
            + "and behind the stone a BRIGHT BURST of warm gold horizon light fans upward and outward, "
            + "silhouetting its top edge and throwing long light past it, as though the road carries on into "
            + "a sunrise. A few small stones and tufts of grass at its base.",
            { framing: "sprite", extra: `${SMALL} Cold grey stone dramatically backlit by a strong warm gold `
                + "sunburst — the glow is half the silhouette and must be clearly visible at small size. "
                + "The stone carries only the carved arrow and no numbers, words or lettering." }),
    },

    // ── THE TWO CHESTS THE GOLDEN WHEEL NEEDS ────────────────────────────────────
    // These join chest-wood.png and chest-gold.png, so they must sit in that set rather than start a new
    // look. Published as PNG, not webp: the wheel resolves prize sprites through P(), which appends .png.
    "chest-iron": {
        dir: PRIZES, file: "chest-iron", ext: "png",
        prompt: housePrompt(
            `${CHEST} Made of dark oak bound in broad riveted IRON straps, with a cold steel lock plate and `
            + "iron corner caps. Sturdy and plain.",
            { framing: "sprite", extra: `${SMALL} Dark wood and cold grey iron, no gold anywhere.` }),
    },
    "chest-mythic": {
        dir: PRIZES, file: "chest-mythic", ext: "png",
        prompt: housePrompt(
            `${CHEST} Made of deep blue-black wood bound in luminous MINT-GREEN crystal banding, with a `
            + "crystal lock plate, faint green light escaping the seam of the lid, and small motes of green "
            + "light rising from it.",
            { framing: "sprite", extra: `${SMALL} Blue-black wood with glowing mint-green crystal (#5affaf).` }),
    },
};

const wanted = Object.entries(JOBS).filter(([name]) => !ONLY.length || ONLY.includes(name));
if (!wanted.length) throw new Error(`--only matched nothing. Names: ${Object.keys(JOBS).join(", ")}`);

async function draw(job) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: job.prompt, size: "1024x1024", quality: Q, n: 1,
            // Every one of these sits on top of a painted shelf or a spinning disc, so all ten are cut out.
            background: "transparent",
        }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return Buffer.from(j.data[0].b64_json, "base64");
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });

    if (!PUBLISH) {
        priceRun({ count: wanted.length, size: "1024x1024", quality: Q });
        for (const [name, job] of wanted) {
            const buf = await draw(job);
            fs.writeFileSync(path.join(OUT, `${job.file}.png`), buf);
            console.log(`drew ${name} -> ${job.file}.png`);
        }
    }

    if (APPLY || PUBLISH) {
        for (const [, job] of wanted) {
            const src = path.join(OUT, `${job.file}.png`);
            if (!fs.existsSync(src)) throw new Error(`no preview at ${src} — run without --publish first`);
            fs.mkdirSync(job.dir, { recursive: true });
            const dest = path.join(job.dir, `${job.file}.${job.ext}`);
            // TRIMMED to its own ink. A sprite's transparent margin must not be what decides how big it
            // looks on the shelf — two objects drawn at different scales inside the same 1024 square read as
            // a mismatched set until both are trimmed.
            const img = sharp(src).trim();
            await (job.ext === "png" ? img.png() : img.webp({ quality: 92 })).toFile(dest);
            console.log(`published ${dest}`);
        }
    } else {
        console.log("\npreview only — look at them, then re-run with --publish to ship exactly those");
    }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
