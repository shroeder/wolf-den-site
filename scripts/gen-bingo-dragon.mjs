// ── THE BINGO DRAGON, DRAWN ──────────────────────────────────────────────────────────────────────────────────
// Bingo's bonus is a dragon that makes one pass across the card and sets a whole line alight — see the long
// note in bingo-kit.js for what it does and why it flies in a straight line rather than scattering.
//
// This draws the one sprite that pass needs. Only one, because the flight is a CSS transform along the path
// (globals.css, `.cas-dragon`) rather than a frame sequence: the sprite travels, scales and mirrors, and a
// hand-drawn frame set would buy motion the transform is already giving for nothing.
//
// WHAT MAKES IT HARD is the same thing that makes every reel symbol hard, one step worse. It crosses the card
// at about 30% of a 300px board, so it is roughly 90 pixels wide, MOVING, over a grid of numbers that must
// stay readable underneath it. So: one unmistakable silhouette, wings spread, seen from above — and lit from
// its own fire, because the thing it is doing is the reason it is there.
//
// Facing RIGHT, always. `.cas-dragon` mirrors it with scaleX for a right-to-left pass, and a sprite drawn
// facing left would fly backwards on half the flights. The arena set learned this the same way.
//
// Run:  node scripts/gen-bingo-dragon.mjs            preview, local PNG only
//       node scripts/gen-bingo-dragon.mjs --apply    write into public/images/casino/
//       node scripts/gen-bingo-dragon.mjs --publish  ship the preview you already looked at
import fs from "node:fs";
import path from "node:path";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const PUBLISH = ARGV.includes("--publish");
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
if (!OPENAI && !PUBLISH) throw new Error("no OPENAI_API_KEY");

const OUT = path.join(process.cwd(), ".bingo-art");
const PUBLIC = path.join(process.cwd(), "public", "images", "casino");
const NAME = "bingo-dragon";

const PROMPT = housePrompt(
    "A fierce red-and-gold DRAGON in flight seen from slightly above, wings spread wide and swept back, "
    + "long neck stretched forward and head turned in profile facing RIGHT, jaws open and breathing a "
    + "streaming plume of fire forward past its snout, tail trailing behind it",
    {
        framing: "sprite",
        extra: "Scales in deep crimson and hot orange with gold along the wing edges and belly, lit from "
            + "below by its own fire so the underside glows amber. Flying to the RIGHT — this is not "
            + "negotiable, the sprite is mirrored in code for the other direction. "
            + "It must read INSTANTLY at 90 pixels wide while MOVING: one bold unmistakable silhouette, "
            + "wings clearly separated from the body, no fine detail, no thin lines, no text, no background "
            + "scenery, nothing else in frame. Generous empty margin on all four sides — no part of the "
            + "dragon or its flame may touch the edge of the frame.",
    },
);

async function draw() {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", quality: Q, background: "transparent", n: 1,
        }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
    return Buffer.from(j.data[0].b64_json, "base64");
}

// The preview folder is the thing that gets shipped by --publish, so what goes live is what was looked at.
// Same rule as every other generator here; see the note in gen-casino-art.mjs.
async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const png = path.join(OUT, `${NAME}.png`);

    if (!PUBLISH) {
        priceRun({ count: 1, size: "1024x1024", quality: Q });
        const buf = await draw();
        fs.writeFileSync(png, buf);
        console.log(`wrote ${png}`);
    }

    if (APPLY || PUBLISH) {
        if (!fs.existsSync(png)) throw new Error(`no preview at ${png} — run without --publish first`);
        const sharp = (await import("sharp")).default;
        fs.mkdirSync(PUBLIC, { recursive: true });
        const dest = path.join(PUBLIC, `${NAME}.webp`);
        await sharp(png).trim().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 92 }).toFile(dest);
        console.log(`published ${dest}`);
    } else {
        console.log("preview only — look at it, then re-run with --publish to ship exactly that");
    }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
