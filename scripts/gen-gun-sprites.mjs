// THE GUN DECK'S OWN ART.
//
// Two jobs.
//
// 1. The three per-gun tracks (Iron / Bore / Lay) were react-icons glyphs — flat single-colour line art in a
//    sheet that is otherwise painted objects.
//
// 2. THE CANNON ITSELF CHANGES AS YOU BUILD IT. A gun with twelve levels in it looked exactly like a gun with
//    none, which makes the whole point of per-barrel upgrades invisible everywhere except a number. Four
//    stages, one every four levels spent across its three tracks, so a barrel you have poured doubloons into
//    is a different object on the deck and in the sheet.
//
//   node scripts/gen-gun-sprites.mjs           # only what is missing
//   node scripts/gen-gun-sprites.mjs --force   # redraw everything
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/gun";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant saturated colors, dramatic rim light, fantasy action-RPG style.";
const CUTOUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 10% of the image empty above, below, left and right. NO part of the object may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it. No text, no words, no letters, no logo, no watermark, no border.";
const P = (s) => `${s} ${STYLE} ${CUTOUT}`;

// The same gun, four times, getting unmistakably better. Same angle and same framing on purpose: they swap in
// place on the deck, so a change of pose would read as a different cannon rather than the same one improved.
const CANNON = "a naval cannon on a wooden carriage seen from a three-quarter angle with the muzzle toward the viewer's right";

const SPRITES = {
    // ── The three tracks.
    iron: P("A thick riveted IRON REINFORCING PLATE wrapped around a short section of cannon barrel, with four heavy bolts and an iron band. Dark blue-grey forged iron, warm brass bolts, cold steel highlights."),
    bore: P("A cannon MUZZLE seen head-on down the bore, wide and dark, with a heavy iron cannonball resting in front of it and a chip of stone beside. Warm brass ring, deep black bore, dark iron ball."),
    // First draw came back sitting on a flat dark panel, which at 34px reads as broken transparency rather
    // than as art. Nothing underneath it — see the same note on `gunnery` in gen-track-sprites.mjs.
    lay: P("A brass GUNNER'S QUOIN — a wedge-shaped elevation block of oiled oak bound in brass — with a small brass sighting notch on its top face, catching a bright glint. Polished brass and warm oak ONLY. NOTHING behind or underneath it: no panel, no plate, no board, no slab, no rectangle, no card, no flat shape of any kind."),

    // ── THE RECKONING. Its meter was an empty rounded rectangle with grey text in it, which at zero fill
    // reads as a broken input rather than a thing you are charging. It needs an object.
    reckoning: P("A small iron-bound POWDER KEG with a short fuse burning at the top, throwing bright orange sparks. Dark oiled oak staves, heavy iron hoops, a hot orange flame and flying embers."),

    // ── The gun, at four stages.
    "cannon-1": P(`A plain, well-used ${CANNON}. Dark cast iron barrel, plain oak carriage, iron-rimmed wheels, no ornament at all — a working gun.`),
    // Redrawn: the first came back with a thick white sticker rim traced around the whole silhouette.
    "cannon-2": P(`A reinforced ${CANNON}. The barrel is banded with riveted iron hoops and the carriage is braced with iron straps and bolts. Dark iron and brass banding over oak. ABSOLUTELY NO white outline, NO pale rim, NO sticker border and NO light-coloured stroke traced around the shape — the dark ink contour must sit directly against transparency.`),
    "cannon-3": P(`A heavy brass ${CANNON}, longer and thicker than a common gun, with polished brass barrel, engraved reinforcing rings, brass-capped wheels and a scrollwork cascabel. Rich warm brass over dark oak, gold highlights.`),
    "cannon-4": P(`A masterwork ${CANNON} — a magnificent long brass gun with deep engraved scrollwork down the barrel, a snarling wolf's-head muzzle, gold inlay, brass-bound carriage and faint heat shimmer at the mouth. Gleaming gold and brass, deep lacquered oak, embers glowing at the touch hole.`),
};

const args = process.argv.slice(2);
const force = args.includes("--force");

async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.1);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(padded).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

for (const [k, prompt] of Object.entries(SPRITES)) {
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`${k}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log("no image for", k); continue; }
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes");
}
console.log("done");
