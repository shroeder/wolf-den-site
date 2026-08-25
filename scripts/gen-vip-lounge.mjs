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
//   lounge   the room itself, 3:1, wide enough to walk across
//   door     the way in, seen from the casino floor: an archway, a rope, and a sign over it
//
// The door is a SEPARATE object rather than part of the floor's wall tile because the wall repeats — it is
// `repeat-x` across the whole world (see .cas-world) — and anything painted into it would appear nine times.
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

const JOBS = {
    // ── THE DOOR, FROM OUTSIDE ───────────────────────────────────────────────────────────────────────────
    // What you see standing on the casino floor. It has to read at about 150 pixels wide against a repeating
    // wall of arches, and it has to say CLOSED TO YOU without looking broken — so: a deep dark archway (the
    // silhouettes of the people inside are drawn over it by the page, see .cas-vipdoor), heavy drapes pulled
    // back, a brass rope across the front at waist height, and a lit sign above.
    //
    // TALL, because it is a door in a wall and the wall is 122% of the room's height. A wide crop would have
    // to be scaled down to fit and the rope would land somewhere near the floor.
    door: {
        size: "1024x1536",
        file: "vip-door",
        prompt: `${HOUSE} A single free-standing grand VIP entrance archway, seen straight on from the front. `
            + "An ornate carved gold arch on two gold pillars. The opening inside the arch is DEEP SOLID "
            + "BLACK and unlit, so nothing beyond it can be made out. Heavy deep-violet velvet curtains hang "
            + "inside the arch on both sides, tied back with gold cords and tassels. Across the front of the "
            + "opening at waist height stands a polished brass stanchion barrier with a thick violet velvet "
            + "rope slung between two posts. Mounted above the arch is a lit sign board with warm bulbs "
            + "around its edge, reading the three capital letters V I P and nothing else. "
            + `Rich violet and gold, glowing, expensive, slightly forbidding. ${CUTOUT}`,
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

    // ── THE TWO YOU CAN TALK TO ──────────────────────────────────────────────────────────────────────────
    // Drawn as separate sprites rather than painted into the room, and this is the opposite call from the
    // couch — for a reason worth stating, because it looks inconsistent otherwise.
    //
    // The couch is FURNITURE: you never touch it, so cutting it out buys nothing. These two are things you
    // walk up to and interact with, exactly like a cabinet on the floor, and everything you can interact with
    // on this floor is its own object with its own hit area and its own hover state. A bartender painted into
    // the wall is a bartender you cannot tell is different from the bottles behind him.
    bartender: {
        size: "1024x1536",
        file: "vip-bartender",
        prompt: `${HOUSE} A single friendly grizzled wolf-man bartender, seen from the front from the waist `
            + "up, facing the viewer. Grey-and-silver fur, one ear notched, a neat dark waistcoat over a "
            + "white shirt with the sleeves rolled up, a bar towel over one shoulder. He is polishing a glass "
            + "and looking directly out with a knowing half-smile. Warm amber rim light along his shoulders. "
            + `Head and torso only. ${CUTOUT} ${NO_TEXT}`,
    },

    vendor: {
        size: "1024x1536",
        file: "vip-vendor",
        prompt: `${HOUSE} A single sly well-dressed fox merchant, seen from the front from the `
            + "waist up, facing the viewer. Russet fur, a deep violet velvet coat with gold frogging, a "
            + "monocle, rings on his fingers. He is holding open a small ornate wooden case with a soft "
            + "violet glow spilling out of it, angled towards the viewer so the glow lights his face from "
            + "below. Conspiratorial expression. Head and torso only. "
            + `${CUTOUT} ${NO_TEXT}`,
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
