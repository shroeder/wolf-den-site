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

// The same house voice the rest of the floor is painted in, so the lounge is the same building.
const HOUSE = "Painterly cel-shaded 2D fantasy game art, bold dark ink contour outlines, rich saturated "
    + "colour, storybook RPG style.";

// ── NO TEXT, AND THE ONE EXCEPTION ───────────────────────────────────────────────────────────────────────────
// Every generator in this repo bans lettering, because an image model cannot be trusted with it — the
// multiplier plates and the pearl both went through this and both ended up having their numeral laid over the
// sprite in CSS instead.
//
// The VIP sign is the exception, and it is a calculated one: "VIP" is three capital letters, it is the single
// most-drawn piece of signage in the entire reference corpus, and a sign that says something ELSE is instantly
// obvious on a contact sheet rather than subtly wrong. It is still checked by eye before it ships, and if it
// comes out mangled the fallback is the same as everywhere else — draw the plate empty and set the letters in
// CSS over it.
const NO_TEXT = "No text, no words, no letters, no numbers, no signage, no logo, no watermark.";

// ── AND `background: "transparent"` IS NOT ENOUGH ON ITS OWN ──────────────────────────────────
// The first pass of the door and the bartender came back with the API flag set and 0.0% transparent pixels in
// the result: a full tan wall behind the archway and a whole painted back-bar behind the wolf. The flag asks
// for an alpha channel; it does not stop the model painting a scene into it.
//
// What causes it is in the PROMPT. Both of those described where the subject was standing — "set into the wall
// of a casino", "standing behind a bar" — and a model told where something is will draw there. The vendor, whose
// prompt said "beside a bar" only in passing, came back 34.8% transparent.
//
// So a cut-out prompt must describe the OBJECT AND NOTHING ELSE, and then say so twice. Checked by counting
// alpha rather than by looking, because a transparent PNG and an opaque one look identical in any viewer that
// composites onto white.
const CUTOUT = "The subject is CUT OUT and completely ISOLATED on a FULLY TRANSPARENT background. There is no "
    + "room, no wall, no floor, no shelf, no furniture and no scenery of any kind behind or around it — only "
    + "empty transparency. Nothing else whatsoever in frame.";

// The player's hero is a stocky chibi — big head, short legs, heavy outline. Anybody who shares a floor with
// them has to be built the same way; a realistic figure scaled down reads as a different game standing in it.
const CHIBI = "Drawn in the same build as a stocky chibi RPG hero sprite: large head, short sturdy body, "
    + "short legs, heavy dark outline, standing squarely on both feet with the whole body and both feet "
    + "visible and nothing cropped. Full length, head to feet.";

const JOBS = {
    // ── THE DOOR THAT SHOULD NEVER HAVE BEEN DRAWN ─────────────────────────────────────
    // A `door` job lived here and produced a fine painting of a gold archway with drapes, a rope and a VIP
    // sign, which was then stood on the casino floor in front of one of the wall's own gold archways.
    //
    // Luke: "the VIP room should not be janky — you made it look like double arches. We already have arches
    // in the background, why can't you just put all the VIPs walking around in there?"
    //
    // He is right, and it is the most ordinary kind of mistake there is: I generated an asset for something
    // the game already had. The wall has been a repeating frieze of arches with dark recesses since the floor
    // was painted, and the VIP entrance is now simply one of them — positioned onto a real arch, with the
    // people drawn inside its recess (see .cas-vipdoor in globals.css).
    //
    // The job is deleted rather than left behind a flag, because a generator that can still produce the wrong
    // answer will produce it again. The only piece worth keeping was the sign, which was cropped out of the
    // last preview into vip-sign.webp — it hangs over the arch, and the arch was already there.

    // ── THE SIGN OVER THE ARCH ───────────────────────────────────────────────────
    // Drawn properly, after being CROPPED out of the deleted door painting for a day. Luke: "vip sign is
    // clearly cut out of a sprite." It was: a hard rectangle with the sign's bottom frame and bulbs sliced
    // off and the arch's scrollwork cut through on both sides, opaque, sitting on a painted wall.
    //
    // Reusing art already paid for is usually right and it was wrong here, because the thing being reused
    // was drawn ATTACHED to something. A crop can only be as clean as the silhouette it cuts along, and a
    // sign painted into an archway has no silhouette of its own — there is no line where the sign stops and
    // the arch starts. Cheaper to draw the object than to keep cutting around one that was never separate.
    //
    // WIDE, because it hangs across the mouth of an arch: a portrait crop would have to be scaled down to
    // span it and the lettering would go with it.
    sign: {
        size: "1536x1024",
        file: "vip-sign",
        prompt: `${HOUSE} A single ornate hanging casino sign board, seen straight on from the front. A `
            + "rectangular gold-framed plaque with a deep red panel inside it, reading the three capital "
            + "letters V I P in large gold serif letters and nothing else. Round warm-lit bulbs set evenly "
            + "all the way around the gold frame, including along the BOTTOM edge. A small decorative gold "
            + "crest on the top edge and two short gold chains rising from the top corners as if it hangs "
            + "from them. Rich gold and deep red, warm glowing bulbs, expensive. "
            + `The whole sign complete and unclipped with space around it. ${CUTOUT}`,
    },

    // ── THE ROOM, FROM INSIDE ────────────────────────────────────────────────────────────────────────────
    // A 3:1 panorama, painted flat with NO vanishing point. That is not a stylistic choice, it is the only
    // thing that works: the camera pans across this room, and a scene with perspective is correct from
    // exactly one camera position and wrong everywhere else. The casino floor's wall learned this the hard
    // way and its note says so at length.
    //
    // The BAR IS AT THE RIGHT-HAND END, because that is where the two people you can talk to stand and the
    // page lays its hit areas over them at fixed percentages. Everything Luke listed is in here: the couch,
    // the fountain, the signs, the fixtures, the bartender.
    lounge: {
        size: "1536x1024",
        file: "vip-room",
        prompt: `${HOUSE} A wide panoramic interior of an opulent private VIP lounge in a fantasy casino, `
            + "painted as a FLAT ELEVATION seen straight on with NO perspective and NO vanishing point, like "
            + "a stage set or a side-scrolling game backdrop. "
            + "Deep violet and midnight-blue walls with gold panelling and wolf motifs carved into them. "
            + "On the LEFT: a long buttoned couch upholstered in gold silk with violet cushions, and beside "
            + "it a tall silver water fountain with lit water falling into a basin, glowing pale blue. "
            + "In the MIDDLE: a low marble table, a thick patterned carpet, and a second smaller couch. "
            + "On the RIGHT: a long polished dark-wood BAR with a brass rail, ranks of glowing bottles on "
            + "lit glass shelves behind it, and two tall bar stools in front. "
            + "Hanging from the ceiling across the whole width: ornate golden chandeliers and lanterns, and "
            + "glowing sign boards in warm amber and violet neon mounted on the walls between them. "
            + "Warm pools of light on the floor beneath each fixture. Opulent, moody, expensive, "
            + "unmistakably a room you had to be let into. "
            + `NO PEOPLE and no characters anywhere in the room. ${NO_TEXT}`,
    },

    // ── THE TWO YOU CAN TALK TO ───────────────────────────────────────────────────
    // FULL BODY, and the first cut was not. I asked for "head and torso only, nothing below the bar" while
    // picturing them behind a bar — and then placed them in a room where the bar is off to one side, so what
    // shipped was two enormous floating busts standing on a carpet. Luke: "what's up with the wolf torsos."
    //
    // A character that shares a floor with the player has to be a WHOLE PERSON standing on it, at a size that
    // makes sense next to them. The hero is a stocky chibi — big head, short legs, heavy outline — so these
    // match that build rather than being realistic figures scaled down, which would read as a different game.
    // They are drawn a little taller than the hero because they are the adults behind the counter.
    bartender: {
        size: "1024x1536",
        file: "vip-bartender",
        prompt: `${HOUSE} A single friendly grizzled wolf-man bartender standing and facing the viewer. `
            + "Grey-and-silver fur, one ear notched, a neat dark waistcoat over a white shirt with the "
            + "sleeves rolled up, dark trousers, a bar towel over one shoulder. He holds a glass in one hand "
            + "and a polishing cloth in the other, with a knowing half-smile. "
            + `${CHIBI} ${CUTOUT} ${NO_TEXT}`,
    },
    vendor: {
        size: "1024x1536",
        file: "vip-vendor",
        prompt: `${HOUSE} A single sly well-dressed fox merchant standing and facing the viewer. Russet fur, `
            + "a deep violet velvet coat with gold frogging over dark trousers and buckled boots, a monocle, "
            + "rings on his fingers. He holds a small ornate wooden case open in both hands with a soft "
            + "violet glow spilling out of it, lighting his face from below. Conspiratorial expression. "
            + `${CHIBI} ${CUTOUT} ${NO_TEXT}`,
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
