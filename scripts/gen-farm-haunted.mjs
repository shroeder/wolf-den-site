// ── THE FARM, WITH THE HALLOWEEN FLAG UP ─────────────────────────────────────────────────────────────────
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-farm-haunted.mjs          # draw + measure
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-farm-haunted.mjs --apply  # upload + store
//
// Replaces the DEFAULT outdoor backdrop only. A member who has generated their own farm background keeps it —
// that is a thing they spent a creation on, and a seasonal flag must not paint over it.
//
// ⚠️ THE GROUND LINE IS THE WHOLE JOB. Sprites, pets, crops and decorations stand between 80% and 92% of the
// scene's height (see FarmClient: `y: 82 + ...`, `ny = 80 + rand(0, 12)`), positioned by CSS and completely
// unaware of what the picture behind them looks like. Paint the horizon too low and the whole farm stands in
// the sky. Measured across the six existing backdrops, the horizon sits at:
//
//     day 69.9%   dawn 69.2%   dusk 66.2%   night 60.9%   storm 72.9%   snow 79.7%
//
// So the set is already loose, and `snow` is the one that gets away with it. 70% is the target — it matches
// the two most-seen backdrops and leaves the full 80-92% sprite band standing on painted grass.
//
// The horizon is MEASURED on the returned image, not hoped for: per-row green-minus-blue, and the horizon is
// the sharpest crossover, which is stable across six different skies in a way brightness is not. Outside the
// accepted band it redraws, up to three times, and says what it got.
//
// COST: gpt-image-1 at `medium`, 1536x1024 — about 11 cents a draw. Medium rather than the house default of
// low because this one is NOT downscaled: it fills the screen behind everything, so the interior detail that
// low throws away is the only thing anybody sees.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const env = readFileSync("../accounting_app/.env", "utf8");
const props = readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const pick = (s, k) => s.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

const APPLY = process.argv.includes("--apply");
const TARGET = 0.70;
const BAND = [0.66, 0.735];
// Taken from the six shipping backdrops, not picked: they score 2.03 (night) to 5.07 (snow) on the bottom
// band, so anything at or under snow is by definition a field this game already ships. The first haunted draw
// scored 6.67 with its pumpkins standing on the sprite line.
const CLUTTER_MAX = 5.2;
const OUT = `${process.env.TEMP}/farm-haunted.png`;

// Same scene as the six it replaces — barn, windmill, big tree, post-and-rail fence, rolling hills — because
// this is the SAME FARM at the wrong time of year, not a different place. A member should recognise their own
// field. The costume is the light, the pumpkins and what is in the sky.
const PROMPT = housePrompt(
    "A wide cartoon FARM PASTURE at night on Halloween, seen straight on. A red barn and a wooden windmill "
    + "stand behind a long post-and-rail fence that runs the full width, with rolling hills behind them and "
    + "one big old tree, now bare and twisted, its branches clawing at the sky. A huge low ORANGE HARVEST "
    + "MOON hangs behind the barn. Carved JACK-O'-LANTERNS with candlelight in them sit along the fence line "
    + "BEHIND the fence only, never in front of it. A few bats cross the sky. Low ground mist drifts between the "
    + "fence posts. Deep indigo sky, cold blue-green grass, warm orange candlelight as the only warm colour.",
    { framing: "scene",
        extra: "COMPOSITION IS CRITICAL: the horizon and the fence line must sit at 70% of the image height, "
            + "so the sky fills the TOP 70% and an unbroken field of GRASS fills the BOTTOM 30% edge to edge. "
            + "The bottom third must be plain open grass with nothing standing in it — no fence, no props, no "
            + "pumpkins, no path, no buildings, no objects of any kind below the fence line — because game "
            + "characters are drawn standing there and anything painted in that band collides with them. "
            + "EVERY jack-o'-lantern belongs BEHIND the fence, up at the fence line, never in the open field. "
            + "Uniform left to right so it can be mirrored and tiled seamlessly. "
            + "NO text, no words, no UI, no people, no characters, no border, no vignette, no dark corners." });

// ── AND THE BOTTOM BAND HAS TO BE EMPTY ──────────────────────────────────────────────────────────────────
// ⚠️ THE HORIZON BEING RIGHT IS NOT ENOUGH, which the first accepted draw proved: it measured 67.7% and then
// put a row of jack-o'-lanterns at exactly 80% — standing in the band the pets, crops and hero occupy. The
// prompt asks for plain grass down there and the model ignores it, so it is measured instead of trusted.
//
// Clutter = mean absolute row-to-row change in the bottom 22%. Grass is texture and scores low; a pumpkin is
// a hard-edged object against it and scores high. The threshold is taken from the SIX SHIPPING BACKDROPS
// rather than picked — whatever `day` scores is by definition an acceptable field, so the bar is a little
// above the worst of them.
const clutterOf = async (buf) => {
    const { data, info } = await sharp(buf).resize({ width: 240 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const from = Math.floor(info.height * 0.78);
    let sum = 0, n = 0;
    for (let y = from; y < info.height; y += 1) {
        for (let x = 1; x < info.width; x += 1) {
            sum += Math.abs(data[y * info.width + x] - data[y * info.width + x - 1]);
            n += 1;
        }
    }
    return sum / n;
};

const horizonOf = async (buf) => {
    const { data, info } = await sharp(buf).resize({ width: 200 }).raw().toBuffer({ resolveWithObject: true });
    const rows = [];
    for (let y = 0; y < info.height; y += 1) {
        let gb = 0;
        for (let x = 0; x < info.width; x += 1) { const i = (y * info.width + x) * info.channels; gb += data[i + 1] - data[i + 2]; }
        rows.push(gb / info.width);
    }
    let at = -1, jump = 0;
    for (let y = 1; y < rows.length; y += 1) { const j = rows[y] - rows[y - 1]; if (j > jump) { jump = j; at = y; } }
    return { frac: at / info.height, jump };
};

// ── ⚠️ --apply UPLOADS THE DRAW YOU LOOKED AT ────────────────────────────────────────────────────────────
// It used to REDRAW on apply, which means the contact sheet you approved is not the art that ships and the
// whole measure-then-look loop proves nothing. gen-pet-level6.mjs grew a --from flag after exactly that cost
// a run and shipped a winged lion where a sea turtle had been approved; this file repeated it within an hour
// of being written. Pass --redraw to deliberately buy a new one.
const REDRAW = process.argv.includes("--redraw");
let buf = null, got = null;
if (APPLY && !REDRAW && existsSync(OUT)) {
    buf = readFileSync(OUT);
    got = await horizonOf(buf);
    got.clutter = await clutterOf(buf);
    console.log(`  uploading the draw already on disk — horizon ${(got.frac * 100).toFixed(1)}%, bottom band ${got.clutter.toFixed(2)}`);
    console.log(`  (pass --redraw to buy a new one instead)`);
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
    const h = await horizonOf(candidate);
    h.clutter = await clutterOf(candidate);
    const horizonOk = h.frac >= BAND[0] && h.frac <= BAND[1];
    const bandOk = h.clutter <= CLUTTER_MAX;
    const ok = horizonOk && bandOk;
    console.log(`     horizon ${(h.frac * 100).toFixed(1)}% ${horizonOk ? "ok" : `OUT (want ${BAND[0] * 100}-${BAND[1] * 100}%)`}`
        + `   bottom band ${h.clutter.toFixed(2)} ${bandOk ? "clear" : `CLUTTERED (want <= ${CLUTTER_MAX})`}`);
    // Keep the best candidate on the measure that is actually failing, so three draws converge rather than
    // three draws of the same mistake.
    const score = (x) => Math.abs(x.frac - TARGET) * 10 + Math.max(0, x.clutter - CLUTTER_MAX);
    if (!buf || score(h) < score(got)) { buf = candidate; got = h; }
    if (ok) break;
}

await sharp(buf).png().toFile(OUT);
console.log(`\n  best horizon ${(got.frac * 100).toFixed(1)}%  ->  ${OUT}`);

if (!APPLY) { console.log("  draw only — pass --apply to upload and point the farm at it.\n"); process.exit(0); }
if (!BLOB || !DB) throw new Error("need BLOB_READ_WRITE_TOKEN and DATABASE_URL to apply");

const webp = await sharp(buf).webp({ quality: 90, effort: 5 }).toBuffer();
const blob = await put(`marketplace/farm-bg/haunted-${Date.now()}.webp`, webp, {
    access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000, token: BLOB,
});
// ⚠️ A NEW PATH EVERY TIME, NEVER AN OVERWRITE. Same bytes at the same URL and every phone keeps the old
// picture for a day behind the CDN's max-age — the redrawn-art lesson, paid for on the sailing sky.
const sql = neon(DB);
await sql`INSERT INTO mkt_setting (key, value, updated_at) VALUES ('farm_bg_haunted', ${blob.url}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
console.log(`  stored farm_bg_haunted -> ${blob.url}\n`);
