// ── THE AQUARIUM, THE FARM'S FOURTH ROOM ─────────────────────────────────────────────────────────────────
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-farm-aquarium.mjs          # draw
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-farm-aquarium.mjs --apply  # + store
//   ...--redraw                                                                                   # buy a new one
//
// Luke: "let's make an aquarium area in the farm for all the water type pets."
//
// ⚠️ THE MIDDLE IS WHERE THE PETS GO, so the middle has to be EMPTY. This is the opposite constraint to the
// farm and the tavern: there the sprites stand at the bottom and the foreground had to stay clear, here they
// SWIM, spread from about 28% to 72% of the height, and it is the open water through the centre that has to
// stay open. Plants, rock and coral belong at the edges and along the sand.
//
// Measured rather than trusted, the same way the other two are — the model will happily fill a tank with
// kelp and leave nowhere for a squid to be.
//
// COST: one image at medium, 1536x1024, about 11 cents. Medium because it fills the panel and is not
// downscaled.
import { existsSync, readFileSync } from "node:fs";

import sharp from "sharp";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import "./lib/ai-trace.mjs";

const env = readFileSync("../accounting_app/.env", "utf8");
const props = readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const pick = (s, k) => s.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

const APPLY = process.argv.includes("--apply");
const REDRAW = process.argv.includes("--redraw");
const OUT = `${process.env.TEMP}/farm-aquarium.png`;
// The swim band, and the bar it has to clear. Calibrated against the barn interior's own mid-band, which is a
// backdrop this game already puts characters in front of.
const BAND = [0.28, 0.72];
const CLUTTER_MAX = 7.0;

const PROMPT =
    "A WIDE panoramic view into a large freshwater-and-reef AQUARIUM TANK, seen straight on through the glass, "
    + "side-scroller style. A bed of pale sand and smooth pebbles runs along the BOTTOM with a few rounded "
    + "rocks and clumps of green water-plants growing UP FROM THE SAND at the left and right edges only. "
    + "Coral and taller kelp banked against the FAR LEFT and FAR RIGHT sides. Clear blue-green water filling "
    + "everything between them, with soft sunbeams slanting down from the surface, a drift of tiny bubbles "
    + "rising near the edges, and pale caustic light rippling on the sand. "
    + "⚠️ THE MIDDLE OF THE TANK IS EMPTY OPEN WATER: the whole central band, from a quarter of the way down "
    + "to three quarters of the way down and across the full width, is clear water and NOTHING ELSE — no "
    + "plants, no kelp, no rocks, no coral, no ornaments, no fish, no creatures of any kind — because game "
    + "characters are drawn swimming there. All scenery is at the edges or on the sand. "
    + "NO fish and NO animals anywhere in the image. Painterly 2D video-game background, cel-shaded with "
    + "confident outlines, bright and inviting. No text, no watermark, no UI, no border, no glass frame.";

// Clutter across the SWIM BAND, which is the band the pets occupy. Open water is a smooth gradient and scores
// very low; a stand of kelp through the middle scores high.
const clutterOf = async (buf) => {
    const { data, info } = await sharp(buf).resize({ width: 240 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const from = Math.floor(info.height * BAND[0]);
    const to = Math.floor(info.height * BAND[1]);
    let sum = 0, n = 0;
    for (let y = from; y < to; y += 1) {
        for (let x = 1; x < info.width; x += 1) { sum += Math.abs(data[y * info.width + x] - data[y * info.width + x - 1]); n += 1; }
    }
    return sum / n;
};

let buf = null, clutter = null;
if (APPLY && !REDRAW && existsSync(OUT)) {
    buf = readFileSync(OUT);
    clutter = await clutterOf(buf);
    console.log(`  uploading the draw already on disk — swim band ${clutter.toFixed(2)} (pass --redraw to buy a new one)`);
}
for (let attempt = 1; buf === null && attempt <= 3; attempt += 1) {
    console.log(`  draw ${attempt} (medium, ~$0.11)...`);
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1536x1024", quality: "medium", n: 1 }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    const candidate = Buffer.from(body.data[0].b64_json, "base64");
    const c = await clutterOf(candidate);
    const ok = c <= CLUTTER_MAX;
    console.log(`     swim band ${c.toFixed(2)} ${ok ? "clear" : `CLUTTERED (want <= ${CLUTTER_MAX}) — redrawing`}`);
    if (buf === null || c < clutter) { buf = candidate; clutter = c; }
    if (ok) break;
}

await sharp(buf).png().toFile(OUT);
console.log(`\n  best swim band ${clutter.toFixed(2)}  ->  ${OUT}`);
if (!APPLY) { console.log("  draw only — pass --apply to store.\n"); process.exit(0); }
if (!BLOB || !DB) throw new Error("need BLOB_READ_WRITE_TOKEN and DATABASE_URL to apply");

const webp = await sharp(buf).webp({ quality: 90, effort: 5 }).toBuffer();
const blob = await put(`marketplace/farm-views/aquarium-${Date.now()}.webp`, webp, {
    access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000, token: BLOB,
});
const sql = neon(DB);
await sql`INSERT INTO mkt_setting (key, value, updated_at) VALUES ('farm_bg_aquarium', ${blob.url}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
console.log(`  stored farm_bg_aquarium -> ${blob.url}\n`);
