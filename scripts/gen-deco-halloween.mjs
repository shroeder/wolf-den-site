// ── THE EIGHT SEASONAL FARM DECORATIONS ──────────────────────────────────────────────────────────────────
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-deco-halloween.mjs          # draw
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-deco-halloween.mjs --apply  # + store
//
// Die-cut sprites, same pipeline as the other hundred: the prompt is the one on the catalogue row (built from
// housePrompt in decorations.js), so these sit beside the year-round props as one set rather than as a
// visibly different batch.
//
// ⚠️ low QUALITY AND deHalo, MATCHING generateDecorationSprite. They render at 66px on the farm, so the
// interior detail a higher tier buys is thrown away by the downscale — and deHalo is what stops a die-cut
// sprite shipping with the white sticker rim this codebase has been bitten by before.
//
// COST: 8 images at low, about 2 cents each — 16 cents the lot.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import sharp from "sharp";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import { DECORATIONS } from "../src/lib/marketplace/decorations.js";
import "./lib/ai-trace.mjs";

const env = readFileSync("../accounting_app/.env", "utf8");
const props = readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const pick = (s, k) => s.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

const APPLY = process.argv.includes("--apply");
// ── ⚠️ --apply UPLOADS WHAT WAS DRAWN, IT DOES NOT REDRAW ────────────────────────────────────────────────
// Third generator in this session to need saying: if apply redraws, the contact sheet that was approved is
// not the art that ships, and the look-before-you-store loop proves nothing. The gravestone is exactly why —
// its first draw had the word MOSS chiselled across it, and a redraw on apply could quietly bring that back
// after the fix had been eyeballed. Sprites are cached to disk on draw and uploaded from there.
const REDRAW = process.argv.includes("--redraw");
const CACHE = `${process.env.TEMP}/hw-deco`;
mkdirSync(CACHE, { recursive: true });
const DECO_PX = 384;
// --only <id,id> redraws a single sprite without repaying for the other seven, which is what a reroll of one
// bad silhouette actually costs.
const onlyAt = process.argv.indexOf("--only");
const ONLY = onlyAt > -1 ? (process.argv[onlyAt + 1] || "").split(",").filter(Boolean) : [];
const list = DECORATIONS.filter((d) => d.source === "halloween" && (!ONLY.length || ONLY.includes(d.id)));
console.log(`  ${list.length} seasonal decorations, ${list.length} images at low (~$${(list.length * 0.02).toFixed(2)})\n`);

const out = [];
for (const d of list) {
    const cached = `${CACHE}/${d.id}.webp`;
    if (!REDRAW && existsSync(cached)) {
        out.push({ id: d.id, name: d.name, webp: readFileSync(cached) });
        console.log(`  ${d.id.padEnd(26)} ${d.name.padEnd(24)} reusing the approved draw`);
        continue;
    }
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt: d.prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
    });
    const body = await res.json();
    if (!res.ok) { console.log(`  ⚠️  ${d.id}: ${res.status}`); continue; }
    let buf = Buffer.from(body.data[0].b64_json, "base64");
    // The same peel the server pipeline runs. A die-cut sprite that ships with a white rim is the single most
    // common defect in this whole art set.
    const { deHaloBuffer } = await import("../src/lib/marketplace/dehalo.js");
    buf = await deHaloBuffer(buf).catch(() => buf);
    const webp = await sharp(buf).resize({ width: DECO_PX, height: DECO_PX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88, effort: 5 }).toBuffer();
    writeFileSync(cached, webp);
    out.push({ id: d.id, name: d.name, webp });
    console.log(`  ${d.id.padEnd(26)} ${d.name.padEnd(24)} ${(webp.length / 1024).toFixed(0)}KB`);
}

// A contact sheet before anything is stored — eight sprites are exactly the case where one bad silhouette is
// invisible on its own and obvious in a row.
const TILE = 200;
const tiles = await Promise.all(out.map((o) => sharp(o.webp)
    .resize(TILE, TILE, { fit: "contain", background: { r: 26, g: 24, b: 32, alpha: 1 } }).png().toBuffer()));
const COLS = Math.min(4, tiles.length);
const ROWS = Math.ceil(tiles.length / COLS);
await sharp({ create: { width: TILE * COLS, height: TILE * ROWS, channels: 3, background: { r: 26, g: 24, b: 32 } } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % COLS) * TILE, top: Math.floor(i / COLS) * TILE })))
    .png().toFile(`${process.env.TEMP}/hw-decos.png`);
console.log(`\n  contact sheet -> ${process.env.TEMP}/hw-decos.png`);

if (!APPLY) { console.log("  draw only — pass --apply to store.\n"); process.exit(0); }
const sql = neon(DB);
for (const o of out) {
    const blob = await put(`marketplace/decorations/${o.id}-${Date.now()}.webp`, o.webp, {
        access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000, token: BLOB,
    });
    await sql`INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES (${o.id}, ${blob.url}, NOW())
              ON CONFLICT (deco_id) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`;
}
console.log(`  stored ${out.length} sprites.\n`);
