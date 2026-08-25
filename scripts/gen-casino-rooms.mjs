// THE ROOM BEHIND EACH CABINET — drawn for the shape it is actually shown in.
//
// Luke: "can you make it so the bg isn't super blurry, you half assed it and just stretched the bg." He is
// right, and it is worth writing down exactly what was wrong so it is not repeated.
//
// The cabinet frame and the casino stage were both being painted with the MASTHEAD — and the masthead is a
// deliberate 5:1 letterbox frieze, composed to be read across the top of the reels (see gen-slot-mastheads,
// which says so in its own header). Forcing a 900x200 banner to `cover` a portrait screen blows it up about
// four times and throws away roughly eighty percent of it, so what reached the glass was a soft, cropped
// sliver of somebody else's composition. Blur was then hiding the damage rather than being a choice. That is
// two mistakes stacked: the wrong asset, and a filter used as an apology for it.
//
// So these are painted for the job: TALL, 2:3, one per machine, in the same world as that machine's masthead
// so the floor still reads as five different machines.
//
// ── COMPOSED FOR WHAT IS ACTUALLY VISIBLE ────────────────────────────────────────────────────────────────
// Almost none of this gets seen. The two reel boards are opaque and cover the middle, so what shows is a band
// across the top, a wider one along the bottom, and a rule down each side — plus the whole thing behind the
// page on the stage. The prompts therefore ask for the INTEREST AT THE EDGES and a calm middle: bright,
// detailed top and bottom, quieter through the centre where the glass sits. A picture with its subject dead
// centre would be a picture nobody ever sees.
//
// Run:  node scripts/gen-casino-rooms.mjs [--force] [--only slot4] [--high|--low]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";
import { priceRun, quality } from "./lib/gen-guard.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/casino/room";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game art, bold dark ink contour outlines, rich saturated "
    + "colour, warm torchlit medieval palette, storybook RPG style.";
// The whole composition brief, and the reason this file exists.
const SHAPE = "A TALL VERTICAL scene in 2:3 portrait proportions, painted as a deep interior seen straight "
    + "on. The TOP THIRD and the BOTTOM THIRD carry all the detail and the brightest light. The MIDDLE THIRD "
    + "is deliberately calm, dark and simple — no important subject there, it is where a machine will stand. "
    + "Rich colour throughout, strong atmosphere, glowing light sources. No frame, no border, no vignette.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no people, "
    + "no characters, no slot machine, no arcade cabinet, no screens.";

// Same five worlds as the mastheads, so a cabinet and its room agree about where they are.
const ROOMS = {
    slot: "A moonlit pine forest clearing at night. Above: a silver moon through dark conifer branches, cold "
        + "blue light, drifting mist. Below: mossy boulders, ferns and fallen antlers lit by a low campfire, "
        + "warm orange against the blue",
    slot2: "A harvest larder at night. Above: heavy oak beams hung with bundles of wheat, dried herbs and "
        + "copper pans, warm amber lantern glow. Below: a scrubbed table crowded with preserve jars, gourds "
        + "and a steaming copper pot, firelight from one side",
    slot3: "A deep undersea trench. Above: pale blue-green shafts of light falling from a far surface through "
        + "dark water, drifting motes. Below: a sunken galleon's ribs, glowing coral and anemones in teal and "
        + "violet, spilled gold half buried in sand",
    slot4: "A menagerie at night. Above: ornate wrought-iron cages and hanging vines lit by a big brass "
        + "lantern, violet and teal glow, fireflies. Below: straw-strewn flagstones, brass feeding bowls, "
        + "climbing ivy and a second lantern burning warm orange",
    slot5: "A treasure vault. Above: a vaulted stone ceiling with blued-steel ribs and gold inlay, cold blue "
        + "light from a high grate. Below: heaped gold coins, stacked bullion and cut gemstones spilling out "
        + "of iron-bound chests, warm gold light glinting off them",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");
const Q = quality();
const SIZE = "1024x1536";
const todo = Object.keys(ROOMS).filter((id) => (!only || only.has(id)) && (FORCE || !fs.existsSync(`${OUT}/${id}.webp`)));

priceRun({ count: todo.length, size: SIZE, quality: Q });
if (!todo.length) { console.log("nothing to draw (--force to redraw)"); process.exit(0); }

let made = 0;
for (const id of todo) {
    const prompt = `${ROOMS[id]}. ${SHAPE} ${HOUSE} ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: SIZE, output_format: "png", quality: Q, n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // WebP at a real size. The old banner was 900x200 being scaled up past 4x; this is 768x1152 being scaled
    // DOWN on every phone, which is the difference between soft and sharp and is the whole point of the run.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .resize(768, 1152, { fit: "cover" })
        .webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(`${OUT}/${id}.webp`, buf);
    made += 1;
    console.log(`  ${id.padEnd(6)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made} of ${todo.length}`);
