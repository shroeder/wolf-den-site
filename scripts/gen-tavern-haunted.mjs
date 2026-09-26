// ── THE TAVERN, WITH THE HALLOWEEN FLAG UP ───────────────────────────────────────────────────────────────
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-tavern-haunted.mjs          # draw + measure
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-tavern-haunted.mjs --apply  # upload the approved draw
//   ...--apply --redraw                                                                            # buy a new one
//
// ⚠️ THE BOTTOM BAND IS THE CONSTRAINT, same as the farm but lower. Characters stand at FLOOR_Y = 95% of the
// scene (TavernInterior.js) — right at the bottom edge — so the near plank floor has to be OPEN. Put a stool
// there and the barkeep, the gambler and every player in the room stand inside the furniture.
//
// The shipping room clears from about 78% down, which is the bar to beat. Measured on the returned image
// rather than trusted, because the model reliably ignores "keep the foreground empty".
//
// COST: gpt-image-1 at medium, 1536x1024 — about 11 cents a draw. Medium because this fills the screen and
// is not downscaled; the interior detail low throws away is the whole room.
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
const OUT = `${process.env.TEMP}/tavern-haunted.png`;
// The shipping room scores this on its bottom 22%; anything at or under it is a floor this game already ships.
const CLUTTER_MAX = 6.0;

// The SAME ROOM, dressed. A member walks into the tavern they know — the bar, the fireplaces, the beams, the
// tables — and finds it decorated, not replaced. The costume is the light, the cobwebs and what is on the bar.
const PROMPT =
    "A WIDE panoramic fantasy medieval TAVERN INTERIOR decorated for HALLOWEEN, a long room seen straight-on "
    + "side-scroller style. On the LEFT a long wooden BAR counter with kegs, taps and hanging mugs (NOBODY "
    + "behind it), carved JACK-O'-LANTERNS glowing along the bar top. In the CENTER a big stone FIREPLACE "
    + "burning with EERIE GREEN FLAME instead of orange, with empty round wooden tables and stools around it. "
    + "On the RIGHT a cozy corner with a small gambling table and stools. Heavy timber ceiling beams draped "
    + "with COBWEBS, hanging iron lanterns, a string of tiny pumpkin lights, a couple of small friendly "
    + "GHOSTS drifting near the rafters, a bat hanging from a beam, barrels, and a warm plank floor running "
    + "the whole width. "
    + "IMPORTANT: NO people, NO patrons, NO characters — an EMPTY room, because game characters are drawn "
    + "standing in it. "
    + "⚠️ THE NEAR FLOOR MUST BE EMPTY: the bottom quarter of the image is bare open plank floor across the "
    + "full width — no tables, no stools, no barrels, no pumpkins, no props of any kind in the foreground — "
    + "because characters stand there. All furniture sits in the MIDDLE band and behind. "
    + "Mood: warm firelit tavern gone spooky — green firelight and orange candlelight together, deep shadows, "
    + "cosy rather than frightening. Painterly 2D video-game background, cel-shaded with confident outlines. "
    + "No text, no watermark, no UI, no border.";

const clutterOf = async (buf) => {
    const { data, info } = await sharp(buf).resize({ width: 240 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const from = Math.floor(info.height * 0.78);
    let sum = 0, n = 0;
    for (let y = from; y < info.height; y += 1) {
        for (let x = 1; x < info.width; x += 1) { sum += Math.abs(data[y * info.width + x] - data[y * info.width + x - 1]); n += 1; }
    }
    return sum / n;
};

let buf = null, clutter = null;
if (APPLY && !REDRAW && existsSync(OUT)) {
    buf = readFileSync(OUT);
    clutter = await clutterOf(buf);
    console.log(`  uploading the draw already on disk — bottom band ${clutter.toFixed(2)} (pass --redraw to buy a new one)`);
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
    console.log(`     near floor ${c.toFixed(2)} ${ok ? "clear" : `CLUTTERED (want <= ${CLUTTER_MAX}) — redrawing`}`);
    if (buf === null || c < clutter) { buf = candidate; clutter = c; }
    if (ok) break;
}

await sharp(buf).png().toFile(OUT);
console.log(`\n  best near-floor ${clutter.toFixed(2)}  ->  ${OUT}`);
if (!APPLY) { console.log("  draw only — pass --apply to upload.\n"); process.exit(0); }
if (!BLOB || !DB) throw new Error("need BLOB_READ_WRITE_TOKEN and DATABASE_URL to apply");

const webp = await sharp(buf).webp({ quality: 90, effort: 5 }).toBuffer();
// A new path every time — same bytes at the same URL and every phone keeps the old picture behind the CDN's
// year-long max-age.
const blob = await put(`art/mkt_town_art/tavern-haunted-${Date.now()}.webp`, webp, {
    access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000, token: BLOB,
});
const sql = neon(DB);
await sql`INSERT INTO mkt_town_art (art_key, url) VALUES ('tavern_interior_haunted', ${blob.url})
          ON CONFLICT (art_key) DO UPDATE SET url = EXCLUDED.url`;
console.log(`  stored tavern_interior_haunted -> ${blob.url}\n`);
