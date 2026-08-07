// The four ORDER sprites for a ship battle — the buttons you actually press.
//
// These were react-icons glyphs (GiCannon, GiSailboat, GiShieldBash, GiCrossedSwords): a flat single-colour
// outline on a flat card. Correct, legible, and completely joyless — the one moment in the fight where the
// player is making a decision looked like a settings menu. Everything else the game asks you to tap is a
// painted object, so these are too.
//
// Deliberately OBJECTS rather than scenes: an icon that has to read at ~44px cannot carry a horizon and a
// crew. One prop per order, one dominant colour matching the card it sits on (gold / blue / green / red),
// caught mid-action so the card has some energy standing still.
//
//   node scripts/gen-battle-orders.mjs            # only the ones missing
//   node scripts/gen-battle-orders.mjs --force    # redraw everything
//   node scripts/gen-battle-orders.mjs --sheet    # contact sheet, to judge them together
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/orders";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game icon art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant saturated colors, dramatic rim light, fantasy action-RPG style.";
// Same framing contract as every other die-cut sprite: the model will draw past the edge unless told the
// margin in numbers, and it will drop whatever the prompt does not insist on. See art-style.js.
const CUTOUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 10% of the image empty above, below, left and right. NO part of the object may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it. No text, no words, no letters, no logo, no watermark, no border.";
const P = (s) => `${s} ${STYLE} ${CUTOUT}`;

const ORDERS = {
    broadside: P("A brass-banded naval CANNON on a wooden carriage seen from a three-quarter angle, firing to the right — a bright golden-orange muzzle flash and a burst of smoke bursting from the barrel, a cannonball leaving the flash. Dominant colours warm gold, brass and orange fire."),
    rake: P("A tall ship's MAST AND RIGGING section with a torn canvas sail and snapped ropes whipping loose in the wind, a chain shot spinning through it — cold moonlit blues and pale grey canvas. Dominant colour icy blue."),
    // brace.png is retired with the order — left undeleted so an old cached client does not 404 mid-fight.
    // Asking for "a hole through planking" makes the PLANKING the object and you get a rectangular panel with
    // rounded corners — a background, not a die-cut. The subject has to be the WATER, with the broken timber
    // only as a ragged ring torn around it, explicitly not a plank wall or a square.
    hole: P("A violent BURST OF SEAWATER blasting toward the viewer through a ragged ring of shattered, splintered oak planks, white foam and spray exploding outward, broken timber shards flung around the jet. The wood forms only a torn irregular ring around the water — NOT a square panel, NOT a flat wall of planking, NOT a rectangle. Dominant colours white foam, deep sea blue and dark wet oak."),
    patch: P("A ship's wooden BILGE PUMP handle and a coil of rope beside a timber patch board hammered over planking, water sloshing at the base, iron nails and a mallet. Dominant colours warm oak brown, wet grey water and iron."),
    board: P("A pirate's curved CUTLASS and a heavy iron GRAPPLING HOOK on a rope crossed over each other in an X, blade catching a hot red rim light, rope coiled around them. Dominant colours crimson red and steel."),
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

// Enforce the margin the prompt only asks for, and land every icon on an identical canvas so the four cards
// show them at the same weight. Without this one sprite reads twice the size of its neighbour.
async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.11);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(padded).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

if (args.includes("--sheet")) {
    const keys = Object.keys(ORDERS).filter((k) => fs.existsSync(`${OUT}/${k}.png`));
    const cell = 420, comp = [];
    for (let i = 0; i < keys.length; i++) {
        comp.push({ input: await sharp(`${OUT}/${keys[i]}.png`).resize(cell - 16, cell - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * cell + 8, top: 8 });
    }
    await sharp({ create: { width: keys.length * cell, height: cell, channels: 4, background: { r: 16, g: 26, b: 38, alpha: 1 } } })
        .composite(comp).png().toFile("order-sheet.png");
    console.log("wrote order-sheet.png —", keys.join(" | "));
    process.exit(0);
}

for (const [k, prompt] of Object.entries(ORDERS)) {
    if (only.length && !only.includes(k)) continue;
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // `medium`, not `low`: these are the four things the player looks straight at while deciding, and low
        // sheds detail exactly where a small icon needs it most.
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes");
}
console.log("done");
