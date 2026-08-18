// THE BOBBER, as a painted object.
//
// It was three CSS divs — a red capsule over a white one — sitting in the middle of a scene where the boat,
// the hero, the fish and the monsters are all painted art. On the same screen: one object you can imagine
// picking up, and one that is plainly a rounded rectangle. Everything this game asks you to look at is a thing.
//
// Luke: "can we make a bobber sprite."
//
//   node scripts/gen-fishing-art.mjs            # only what is missing
//   node scripts/gen-fishing-art.mjs --force    # redraw
//   node scripts/gen-fishing-art.mjs --sheet    # contact sheet, to judge it against the boat
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

import { housePrompt } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const args = process.argv.slice(2);
const force = args.includes("--force");
const OUT = "public/images/sailing";
const CANVAS = 512;
const FILL = 0.86;

// housePrompt, not a private STYLE string — every generator composes from the one house style so a bobber and
// a boat look like they came out of the same box. See art-style.js.
const ART = {
    bobber: housePrompt(
        "A classic fishing FLOAT (bobber): a small round buoy, glossy CRIMSON RED on the top half and bright "
        + "OFF-WHITE on the bottom half with a crisp horizontal seam between them, a little brass eyelet and "
        + "ring at the base and a short slim antenna stem rising from the top. Seen from the side, upright, "
        + "the way it sits in water. Wet lacquered highlight down one shoulder. Dominant colours crimson red, "
        + "cream white and warm brass.",
    ),
};

// Same framing pass every die-cut sprite in the repo goes through: trim the transparent margin the model
// leaves, refit to a known fill, re-centre on a fixed canvas. Without it each sprite arrives at its own scale
// and the CSS has to compensate per file, which is how a set stops matching.
async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const target = Math.round(CANVAS * FILL);
    const fitted = await sharp(t).resize(target, target, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const m = await sharp(fitted).metadata();
    return sharp(fitted).extend({
        top: Math.floor((CANVAS - m.height) / 2), bottom: Math.ceil((CANVAS - m.height) / 2),
        left: Math.floor((CANVAS - m.width) / 2), right: Math.ceil((CANVAS - m.width) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer();
}

if (args.includes("--sheet")) {
    const tiles = [["bobber", `${OUT}/bobber.png`], ["boat", `${OUT}/boat-tier5-galleon.png`]];
    const cell = 240;
    const comp = [];
    for (let i = 0; i < tiles.length; i += 1) {
        if (!fs.existsSync(tiles[i][1])) continue;
        comp.push({ input: await sharp(tiles[i][1]).resize(cell - 16, cell - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * cell + 8, top: 8 });
    }
    await sharp({ create: { width: tiles.length * cell, height: cell, channels: 4, background: { r: 16, g: 26, b: 38, alpha: 1 } } })
        .composite(comp).png().toFile("fishing-sheet.png");
    console.log("wrote fishing-sheet.png");
    process.exit(0);
}

for (const [k, prompt] of Object.entries(ART)) {
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // `medium` — the default for anything drawn at sprite size (see the note in art-style.js on what the
        // quality tier costs). A bobber is a simple shape read at ~26px; high would buy interior detail no
        // one will ever see and cost about four times as much.
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes");
}
console.log("done");
