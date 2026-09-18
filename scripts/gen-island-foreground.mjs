// ── THE LAYER THAT PASSES IN FRONT OF YOU ────────────────────────────────────────────────────────────────────
// One extreme-foreground plate per BIOME — five, shared by the five islands of that water, the same economy
// the props already use.
//
// It exists because of what the island actually was: a single painted plate sliding sideways behind a row of
// cut-outs, which reads as looking THROUGH a window at a picture. Depth on a side-scroller does not come from
// the backdrop; it comes from something close to the camera crossing in front of the thing you are following,
// faster than it. That is the one layer the archipelago never had.
//
// ⚠️ THE TOP TWO THIRDS MUST BE EMPTY, AND THAT IS THE WHOLE ASK. This is not a die-cut subject — DIE_CUT
// wants one centred thing touching no edge, which is the exact opposite of a band that runs off both sides
// (gen-brig.mjs paid for that lesson: asking it for prison bars returned a horned ogre). So the framing here
// is written from scratch rather than taken from housePrompt's sprite framing, and the house LOOK still comes
// from HOUSE_STYLE so these belong to the same archipelago as everything behind them.
//
// ⚠️ AND IT IS MIRROR-TILED, like the backdrops. The prompt asks for edges that meet and the model does not
// really deliver that; a plate laid beside a flipped copy of itself has only MIRROR joins, which the eye does
// not read as a seam. Costs nothing and doubles the width, so the parallax rarely has to wrap.
//
//   node scripts/gen-island-foreground.mjs            # only what is missing
//   node scripts/gen-island-foreground.mjs --force    # redraw
//   node scripts/gen-island-foreground.mjs --dry      # price it and draw nothing
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";
import { priceRun, quality } from "./lib/gen-guard.mjs";
import { HOUSE_STYLE, NEGATIVE_STYLE } from "../src/lib/marketplace/art-style.js";
import { BIOMES } from "../src/lib/marketplace/islands.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/islands/fg";
fs.mkdirSync(OUT, { recursive: true });
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");
const Q = quality();

// What is growing/standing right at the camera, per water. Concrete nouns, because a blurb plus a shape word
// is how forty wardens came back as the same shark — see [[generate-sprites-direct-to-ai]].
const FG = {
    coral: "dead brain-coral heads, bleached staghorn coral branches and dry spiky sea-grass tussocks",
    ash: "jagged broken slabs of black cooled lava, twisted dead tree stumps and drifts of grey ash",
    drowned: "the tops of drowned brick walls, a leaning chimney pot, reeds and rotted fence posts",
    frost: "ridged blue shore-ice, snow-crusted grey boulders and frozen driftwood",
    green: "enormous fern fronds, hanging vines, buttress roots and broad wet leaves",
};

// The framing, written for a BAND rather than for a subject. Every clause here was a failure first.
const BAND = (stuff, tint) =>
    "A horizontal band of " + stuff + " seen EXTREMELY CLOSE UP, as if standing right at the viewer's feet at "
    + "the very bottom of the frame, looking past it. "
    + "COMPOSITION, and this is the most important requirement: the shapes occupy ONLY THE BOTTOM THIRD of the "
    + "image and run continuously from the LEFT EDGE to the RIGHT EDGE, touching and running off both side "
    + "edges and off the bottom edge. The TOP TWO THIRDS of the image are COMPLETELY EMPTY — fully "
    + "transparent, nothing drawn there at all, no sky, no horizon, no background, no scenery, no haze. "
    + "There is NO single centred subject and NO focal point; it is an even continuous run of foreground "
    + "clutter, silhouetted DARK and low in contrast against nothing, lit only by a cool rim of "
    + tint + " light along its upper edges. Deep shadow, heavy and near-black in its masses, because this is "
    + "the layer closest to the camera and everything behind it is brighter. "
    + "The left and right edges are drawn so they could meet if the image were repeated. "
    + HOUSE_STYLE + " " + NEGATIVE_STYLE
    + " No white or pale rim along the TOP of the shapes, no glow, no cast shadow on empty space.";

const todo = Object.keys(FG).filter((b) => FORCE || !fs.existsSync(`${OUT}/${b}.webp`));
console.log(`\n${Object.keys(FG).length} biomes · ${todo.length} to draw`);
priceRun({ count: todo.length, size: "1536x1024", quality: Q });
if (DRY) { console.log("   --dry, so nothing was drawn.\n"); process.exit(0); }

let drawn = 0, failed = 0;
for (const biome of todo) {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", size: "1536x1024", output_format: "png", quality: Q, n: 1,
            background: "transparent",
            prompt: BAND(FG[biome], BIOMES[biome].tint),
        }),
    });
    if (!r.ok) { failed += 1; console.log(`  ✗ ${biome}: OpenAI ${r.status} ${(await r.text()).slice(0, 160)}`); continue; }
    const j = await r.json();

    // ⚠️ CROP TO THE BAND, THEN FLOOR THE ALPHA. Two separate corrections, both learned the hard way:
    //   · the model leaves the empty two thirds as near-transparent rather than transparent, and a film of
    //     alpha 1-2 is enough for a CSS drop-shadow to draw the whole rectangle — see the chart sprite in
    //     gen-expedition-chrome.mjs. Under 12 is nothing, so make it nothing.
    //   · keeping the empty two thirds in the file means every island load pays for a megabyte of blank
    //     alpha. The band is the bottom third; that is the only part with anything in it.
    const src = sharp(Buffer.from(j.data[0].b64_json, "base64")).extract({ left: 0, top: 600, width: 1536, height: 424 });
    const { data, info } = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // ⚠️ AND FEATHER THE TOP EDGE, because the crop above is a STRAIGHT CUT THROUGH PAINT. The model does not
    // reliably leave the upper frame empty however the prompt is worded, so the extract slices a scene in half
    // and the join shows on screen as a hard horizontal line across the island — which is worse than the seam
    // mirror-tiling was invented to hide, because it runs the full width at a fixed height. Caught by laying
    // the band over a real backdrop and looking at it. The top FEATHER rows dissolve to nothing instead.
    const FEATHER = Math.round(info.height * 0.34);
    for (let y = 0; y < FEATHER; y += 1) {
        const k = y / FEATHER;                       // 0 at the very top, 1 where the band is solid
        for (let x = 0; x < info.width; x += 1) {
            const i = (y * info.width + x) * info.channels + 3;
            data[i] = Math.round(data[i] * k * k);   // squared, so the dissolve starts slow and is invisible
        }
    }
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < 12) data[i] = 0;
    const plate = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .png().toBuffer();
    const flipped = await sharp(plate).flop().toBuffer();
    await sharp({ create: { width: info.width * 2, height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: plate, left: 0, top: 0 }, { input: flipped, left: info.width, top: 0 }])
        .webp({ quality: 88, effort: 5, alphaQuality: 100 })
        .toFile(`${OUT}/${biome}.webp`);
    drawn += 1;
    console.log(`  ✓ ${biome}  →  ${OUT}/${biome}.webp`);
}
console.log(`\n  drew ${drawn}, failed ${failed}.`);
console.log("  ⚠️ LOOK at them in one contact sheet, over a backdrop, at the size they are drawn — a foreground");
console.log("     that came back as one centred bush is invisible in a file listing and obvious in a glance.\n");
