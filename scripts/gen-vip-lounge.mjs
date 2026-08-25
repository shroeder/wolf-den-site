// ── THE VIP LOUNGE, DRAWN ────────────────────────────────────────────────────────────────────────────────────
// Luke: "add a VIP only section that has that little barrier over the front of a door and it has a VIP sign...
// inside the VIP room for now just generate a background sprite... maybe generate a bunch of cool looking
// decorations like a golden couch and a silver water fountain and all sorts of really cool stuff. It should
// look amazing with a bunch of lights in different blinking signs and Wolf Den themed signs and fixtures
// hanging from the ceiling and on the walls, and it should have a bar in the back where you can see a
// bartender hanging out."
//
// ── ONE PAINTING, NOT TWENTY SPRITES ─────────────────────────────────────────────────────────────────────────
// The obvious reading of that list is a couch sprite, a fountain sprite, six sign sprites and a bartender
// sprite, placed by hand. That is the wrong build and the casino floor already proves it: the floor is a
// repeating WALL with nine objects in front of it, and it works because the nine objects are things you can
// walk up to and USE. A golden couch is not. Cutting the couch out as its own sprite buys nothing except a
// second thing to position, and it costs the one thing a lounge is actually for, which is looking expensive.
//
// So the room is painted as ONE WIDE SCENE with everything in it — the couch, the fountain, the fixtures, the
// signs, the bar — and the two things you can talk to are painted INTO it at known positions, with the hit
// areas laid over them in CSS. That is the same trick the tavern uses for its keeper.
//
// Two images:
//   lounge      the room itself, wide, painted flat
//   bartender   and vendor, the two you can talk to, as cut-outs that stand in it
//
// There is no `door` job. See the note where it used to be.
//
// Run:  node scripts/gen-vip-lounge.mjs            preview, local PNGs only
//       node scripts/gen-vip-lounge.mjs --apply    write into public/images/casino/
//       node scripts/gen-vip-lounge.mjs --publish  ship the previews you already looked at
//       node scripts/gen-vip-lounge.mjs --only=door
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

const OUT = path.join(process.cwd(), ".vip-art");
const PUBLIC = path.join(process.cwd(), "public", "images", "casino");

// ── THE STYLE COMES FROM art-style.js, NOT FROM HERE ─────────────────────────────────
// Luke: "what is with the style on these sprites and background, it doesn't match anything we use."
//
// He is right and the cause is embarrassing: this file wrote its OWN style prose. A local HOUSE constant
// ("painterly cel-shaded, storybook RPG"), a local CUTOUT and a local NO_TEXT — three hand-rolled versions
// of three things that already exist, while the other eighteen generators in this repo import
// housePrompt(). art-style.js opens with a list of the four different looks the game ended up with the
// LAST time somebody did this, and its first line says: import this from any generator instead of writing
// style prose inline. I read that file to write the dragon and then did not use it here.
//
// THE MODEL WAS NEVER THE PROBLEM — gpt-image-1 at medium, the same as all 68 other image calls in the
// repo. The prompt was.
//
// So: subject only, and the house does the rest. framing "sprite" brings DIE_CUT (isolated, transparent,
// 8% margin, nothing touching an edge); framing "scene" brings SCENE; NEGATIVE_STYLE bans the sticker rim
// and the lettering on both.

// The player's hero is a stocky chibi — big head, short legs. Anybody sharing a floor with them has to be
// built the same way; a realistic figure scaled down reads as a different game standing in it.
const CHIBI = "Built like a stocky chibi RPG hero sprite: large head, short sturdy body, short legs, "
    + "standing squarely on both feet with the whole body and both feet visible and nothing cropped.";

const JOBS = {
    // ── THE SIGN OVER THE ARCH ─────────────────────────────
    // Drawn as its own object after being CROPPED out of the deleted door painting for a day. Luke: "vip sign
    // is clearly cut out of a sprite." A crop is only as clean as the silhouette it cuts along, and a sign
    // painted INTO an archway has no silhouette of its own.
    //
    // THE ONE PLACE LETTERING IS ALLOWED. NEGATIVE_STYLE bans text everywhere, for good reason — but "VIP"
    // is three capitals and the most-drawn sign in the reference corpus, so a wrong one is obvious at a glance
    // rather than subtly off. Checked by eye before it ships; if it ever comes back mangled the fallback is
    // the plate empty and the letters set in CSS.
    sign: {
        size: "1536x1024",
        file: "vip-sign",
        prompt: housePrompt(
            "An ornate hanging casino sign board: a rectangular gold frame with a deep red panel inside it, "
            + "reading the three capital letters V I P in large gold serif letters and nothing else. Round "
            + "warm-lit bulbs set evenly all the way around the frame including along the BOTTOM edge, a small "
            + "gold crest on the top edge, and two short gold chains rising from the top corners.",
            { framing: "sprite", extra: "Gold and deep red, the bulbs warm and glowing. It hangs over the "
                + "mouth of an archway and must read at about 120 pixels wide. THE LETTERING IS THE ONE "
                + "EXCEPTION to the no-text rule: the sign must say exactly VIP." }),
    },

    // ── THE ROOM ──────────────────────────────────
    // A FLAT ELEVATION with no vanishing point — not a stylistic choice, the only thing that works: the
    // camera pans across this room, and a scene with perspective is correct from exactly one camera position
    // and wrong everywhere else. The casino floor's wall learned that the hard way.
    lounge: {
        size: "1536x1024",
        file: "vip-room",
        prompt: housePrompt(
            "The interior of an opulent private VIP lounge in a fantasy casino, painted as a FLAT ELEVATION "
            + "seen straight on with NO perspective and NO vanishing point, like a stage set. Deep violet and "
            + "midnight-blue walls with gold panelling and carved wolf motifs. On the LEFT a long buttoned "
            + "couch in gold silk with violet cushions and a tall silver water fountain lit from within. In "
            + "the MIDDLE a low marble table, a thick patterned carpet and a second couch. On the RIGHT a long "
            + "polished dark-wood BAR with a brass rail, lit glass shelves of glowing bottles behind it and "
            + "two tall stools. Golden chandeliers and lanterns hang across the whole width, with warm pools "
            + "of light on the floor beneath each one.",
            { framing: "scene", extra: "Opulent, moody and expensive — unmistakably a room you had to be "
                + "let into. NO PEOPLE and no characters anywhere in it." }),
    },

    // ── THE TWO YOU CAN TALK TO ────────────────────────────
    // FULL BODY. The first cut asked for "head and torso only, nothing below the bar" while picturing them
    // behind a bar, then placed them in a room whose bar is off to one side — two enormous floating busts
    // standing on a carpet. Luke: "what's up with the wolf torsos."
    bartender: {
        size: "1024x1536",
        file: "vip-bartender",
        prompt: housePrompt(
            "A friendly grizzled wolf-man bartender standing and facing the viewer, seen head to foot. "
            + "Silver-grey fur and one notched ear, wearing a rich CRIMSON waistcoat with polished gold "
            + "buttons over a cream shirt with the sleeves rolled up, a deep teal necktie, dark navy trousers "
            + "and brown boots, with a gold-striped bar towel over one shoulder. He holds a glass in one hand "
            + "and a polishing cloth in the other, with a knowing half-smile.",
            // ── A GREY WOLF IN BROWN IS NOT A COLOUR SCHEME ─────────────────────────────────
            // The first house-style pass came back nearly monochrome sepia, and the house style was not at
            // fault — I had described a grey animal in a dark waistcoat and dark trousers, which is a
            // colourless character however richly it is painted. HOUSE_STYLE asks for "rich saturated
            // jewel-tone colours" and can only deliver them if the SUBJECT has some. Sable came back vivid
            // from the same prompt template because a russet fox in a violet coat is vivid.
            //
            // So Rolf keeps his silver fur and is dressed in crimson and gold — warm, against a lounge that
            // is violet and gold, so he reads as a person in the room rather than part of the panelling.
            { framing: "sprite", extra: `${CHIBI} Warm crimson and gold against silver fur — he must read as `
                + "the brightest thing at his end of a violet room." }),
    },
    vendor: {
        size: "1024x1536",
        file: "vip-vendor",
        prompt: housePrompt(
            "A sly well-dressed fox merchant standing and facing the viewer, seen head to foot. Russet fur, a "
            + "deep violet velvet coat with gold frogging over dark trousers and buckled boots, a monocle and "
            + "rings on his fingers. He holds a small ornate wooden case open in both hands with a violet glow "
            + "spilling out of it, lighting his face from below. Conspiratorial expression.",
            { framing: "sprite", extra: CHIBI }),
    },
};

const wanted = Object.entries(JOBS).filter(([k]) => !ONLY.length || ONLY.includes(k));

async function draw(job) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: job.prompt, size: job.size, quality: Q, n: 1,
            // The room is a full-bleed painting; the other three are objects that sit on top of one.
            background: job.file === "vip-room" ? "opaque" : "transparent",
        }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return Buffer.from(j.data[0].b64_json, "base64");
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });

    if (!PUBLISH) {
        // Priced per size, because a 2:3 portrait and a 3:2 landscape are not the same bill.
        for (const [, job] of wanted) priceRun({ count: 1, size: job.size, quality: Q });
        for (const [name, job] of wanted) {
            const buf = await draw(job);
            fs.writeFileSync(path.join(OUT, `${job.file}.png`), buf);
            console.log(`drew ${name} -> ${job.file}.png`);
        }
    }

    if (APPLY || PUBLISH) {
        fs.mkdirSync(PUBLIC, { recursive: true });
        for (const [, job] of wanted) {
            const src = path.join(OUT, `${job.file}.png`);
            if (!fs.existsSync(src)) throw new Error(`no preview at ${src} — run without --publish first`);
            const dest = path.join(PUBLIC, `${job.file}.webp`);
            // The room stays wide and full-bleed; the objects are trimmed to their own ink so a sprite's
            // transparent margin does not decide where it sits on the page.
            const img = job.file === "vip-room" ? sharp(src).resize(1920, 1280, { fit: "cover" })
                : sharp(src).trim();
            await img.webp({ quality: 90 }).toFile(dest);
            console.log(`published ${dest}`);
        }
    } else {
        console.log("\npreview only — look at the sheet, then re-run with --publish to ship exactly that");
    }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
