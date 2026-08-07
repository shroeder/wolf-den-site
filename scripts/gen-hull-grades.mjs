// Five HULL GRADE badges — how much ship somebody is, at a glance.
//
// Boat level is base hull now, so the boat you have spent weeks levelling is the single biggest thing about
// your ship in a fight. That deserves to be visible: a number you have to hold two of and compare is not a
// reward, it is homework. One badge per grade, from bare planking to a fortress that floats.
//
//   node scripts/gen-hull-grades.mjs [--force] [--sheet]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/hull";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant saturated colors, dramatic rim light, fantasy action-RPG style.";
// The first pass came back with a white sticker rim on grade 2 and a thin gold keyline on 1 and 3 — the
// CUTOUT below already forbade both, so it says it again in the language the model actually respects: name the
// thing, then name it as a border, then say the edge is bare.
const NO_RIM = "The edge of the object must be BARE — the artwork simply ends. Absolutely NO outline stroke drawn around the outside of the shape, NO white rim, NO cream rim, NO gold or yellow keyline, NO sticker border, NO die-cut edge, NO contrasting halo of any colour tracing the silhouette.";
const CUTOUT = NO_RIM + " A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 12% empty on every side. NO part of it may touch any edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim, NO badge or frame behind it. No text, no words, no numbers, no letters, no watermark, no border.";
const P = (s) => `${s} ${STYLE} ${CUTOUT}`;

// The SAME object, escalating — a section of ship's hull, five ways. Reading them side by side has to feel
// like one thing getting stronger, which only works if the subject never changes.
const GRADES = {
    grade1: P("A small square section of a ship's hull made of BARE WEATHERED TIMBER planking, pale sun-bleached oak, one plank slightly sprung, a single rusted nail. Plain and poor."),
    grade2: P("A square section of ship's hull of DOUBLED OAK PLANKING with a horizontal reinforcing strake bolted across it and a few iron nails. Warm honey-brown oak, modest iron."),
    grade3: P("A square section of ship's hull of dark oak BOUND WITH IRON BANDS — two thick riveted iron straps crossing the timber, heavy bolt heads. Deep brown oak and dark grey iron."),
    grade4: P("A square section of ship's hull PLATED IN OVERLAPPING STEEL, riveted armour plates almost covering the oak beneath, one shallow cannonball dent that did not penetrate. Cold steel and gunmetal with warm oak at the edges."),
    grade5: P("A square section of an IRONCLAD hull — seamless blackened armour plate with heavy gold-brass rivets and a raised reinforcing ridge, faint heat-blue sheen on the metal, utterly impenetrable. Black iron, steel blue and brass."),
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.1);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(padded).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

if (args.includes("--sheet")) {
    const keys = Object.keys(GRADES).filter((k) => fs.existsSync(`${OUT}/${k}.png`));
    const cell = 260, comp = [];
    for (let i = 0; i < keys.length; i++) {
        comp.push({ input: await sharp(`${OUT}/${keys[i]}.png`).resize(cell - 16, cell - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * cell + 8, top: 8 });
    }
    await sharp({ create: { width: keys.length * cell, height: cell, channels: 4, background: { r: 16, g: 26, b: 38, alpha: 1 } } })
        .composite(comp).png().toFile("hull-sheet.png");
    console.log("wrote hull-sheet.png —", keys.join(" | "));
    process.exit(0);
}

for (const [k, prompt] of Object.entries(GRADES)) {
    if (only.length && !only.includes(k)) continue;
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes");
}
console.log("done");
