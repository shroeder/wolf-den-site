// Sprites for every dish, every prep recipe and every prepped ingredient in the Kitchen.
//
// These render at badge size or smaller, so they're generated at `low` — the detail a higher tier buys is
// thrown away by the downscale long before anyone sees it, and there are 76 of them. Raw ingredients are NOT
// generated here on purpose: crops already have `crop_<id>_ripe` in mkt_town_art and fish already have PNGs in
// public/images/fish, and paying twice for a picture we own is just waste.
//
// Usage: node scripts/gen-cooking-sprites.mjs [ref1 ref2 …]   (no args = everything still missing art)
import fs from "node:fs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";

function pick(text, key) {
    for (const line of text.split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return null;
}
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const OPENAI_KEY = pick(props, "OPENAI_API_KEY");
const DB_URL = pick(env, "DATABASE_URL");
const BLOB_TOKEN = pick(env, "BLOB_READ_WRITE_TOKEN");
if (!OPENAI_KEY?.startsWith("sk-")) throw new Error("bad OPENAI_API_KEY");
const sql = neon(DB_URL);

// Parsed straight out of cooking.js so this can never drift from the catalogue it's drawing.
const src = fs.readFileSync("src/lib/marketplace/cooking.js", "utf8");
// B() joins R and P here: twenty of the Kitchen's recipes are BAIT now, and a generator that only knew two
// letters would have left every one of them with no art while reporting success.
const RECIPES = [...src.matchAll(/^\s+([RPB])\("([a-z_0-9]+)",\s*"([^"]+)",\s*(\d)/gm)]
    .map((m) => ({ ref: m[2], name: m[3], tier: Number(m[4]), kind: m[1] === "P" ? "prep" : m[1] === "B" ? "baitprep" : "dish" }));
const PREPS = [...src.matchAll(/^\s+(p_[a-z]+):\s*\{ name: "([^"]+)"/gm)].map((m) => ({ ref: m[1], name: m[2], kind: "ingredient" }));
// The bait ITEMS, which are what the pantry holds and the fishing screen shows — a separate picture from the
// recipe that makes them, exactly as a prep and its recipe are separate.
const BAITS = [...src.matchAll(/^\s+(b_[a-z_]+):\s*\{ name: "([^"]+)"/gm)].map((m) => ({ ref: m[1], name: m[2], kind: "bait" }));
const ALL = [...RECIPES, ...PREPS, ...BAITS];

function promptFor(item) {
    if (item.kind === "ingredient") {
        return `A single prepared cooking INGREDIENT for a fantasy cooking game: ${item.name}. Shown on its own as one clear object — a sack, jar, crock, bottle, block or bundle as suits it. Bold stylized 2D game item icon, dark ink contour lines, cel-shaded flat vibrant colors, warm rustic fantasy kitchen palette, strong readable silhouette, centered, fills most of the frame, viewed straight on. Die-cut on a FULLY TRANSPARENT background — no backdrop, no scene, no table, no glow, no vignette, no drop shadow, no plate under it. No text, no letters, no numbers, no logo, no watermark, no border. Must stay clearly legible shrunk to 32 pixels.`;
    }
    if (item.kind === "bait") {
        // A bait is a thing you throw in the water, not a plated dish — same house style, different subject,
        // or twenty of these come back looking like dinner.
        return `A single piece of fishing BAIT for a fantasy game: ${item.name}. One clear object as suits it — a baited hook, a packed ball, a jar of chum, a carved lure, a bundle on a line. Slightly wet, coastal, workmanlike. Bold stylized 2D game item icon, dark ink contour lines, cel-shaded flat vibrant colors, weathered dockside palette of rope, brine and rust with the bait's own colour dominant, strong readable silhouette, centered, fills most of the frame, viewed straight on. Die-cut on a FULLY TRANSPARENT background — no backdrop, no scene, no water, no table, no glow, no vignette, no drop shadow. No text, no letters, no numbers, no logo, no watermark, no border. Must stay clearly legible shrunk to 32 pixels.`;
    }
    if (item.kind === "baitprep") {
        return `A fantasy game icon for PREPARING fishing bait, a task called "${item.name}": the tools and raw materials of that job arranged as one compact object group on a dockside workbench — knife, twine, bucket, jar, cut ingredients. Bold stylized 2D game item icon, dark ink contour lines, cel-shaded flat vibrant colors, weathered dockside palette, strong readable silhouette, centered, fills most of the frame. Die-cut on a FULLY TRANSPARENT background — no backdrop, no scene, no table, no glow, no drop shadow. No text, no letters, no numbers, no logo, no watermark, no border. Must stay clearly legible shrunk to 32 pixels.`;
    }
    if (item.kind === "prep") {
        return `A fantasy cooking-game icon for a PREPARATION step called "${item.name}": the tools and raw materials of that task arranged as one compact object group. Bold stylized 2D game item icon, dark ink contour lines, cel-shaded flat vibrant colors, warm rustic fantasy kitchen palette, strong readable silhouette, centered, fills most of the frame. Die-cut on a FULLY TRANSPARENT background — no backdrop, no scene, no table, no glow, no drop shadow. No text, no letters, no numbers, no logo, no watermark, no border. Must stay clearly legible shrunk to 32 pixels.`;
    }
    return `A finished plated DISH for a fantasy cooking game: "${item.name}". Appetising, served on a simple rustic plate, bowl, board or pot as suits the dish, seen from a three-quarter angle. Bold stylized 2D game item icon, dark ink contour lines, cel-shaded flat vibrant colors, warm rustic fantasy kitchen palette, strong readable silhouette, centered, fills most of the frame. Die-cut on a FULLY TRANSPARENT background — no backdrop, no scene, no tablecloth, no glow, no vignette, no drop shadow. No text, no letters, no numbers, no logo, no watermark, no border. Must stay clearly legible shrunk to 32 pixels.`;
}

const argv = process.argv.slice(2);
const done = new Set((await sql`SELECT ref FROM mkt_cooking_sprite`).map((r) => r.ref));
const todo = (argv.length ? ALL.filter((x) => argv.includes(x.ref)) : ALL.filter((x) => !done.has(x.ref)));
console.log(`catalogue: ${RECIPES.length} recipes + ${PREPS.length} prepped ingredients + ${BAITS.length} baits`);
console.log(`generating ${todo.length} sprite(s)…`);

// CONCURRENCY. The first version of this was a plain sequential loop: fire one image, wait ~15 seconds, fire
// the next. For 76 sprites that's twenty minutes of waiting on a round trip rather than doing any work, and the
// image API is perfectly happy to take several at once. A small fixed pool keeps it well inside rate limits
// while cutting the wall-clock by roughly the pool size.
const POOL = 5;
let ok = 0, failed = 0;

async function makeOne(item) {
    const prompt = promptFor(item);
    try {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
        });
        const j = await res.json();
        if (!res.ok) { console.log(`  x ${item.ref}: ${JSON.stringify(j).slice(0, 120)}`); failed += 1; return; }
        const buf = Buffer.from(j.data[0].b64_json, "base64");
        const webp = await sharp(buf).resize({ width: 192, withoutEnlargement: true }).webp({ quality: 88, effort: 5 }).toBuffer();
        const { url } = await put(`marketplace/cooking/${item.ref}-${Date.now()}.webp`, webp, { access: "public", token: BLOB_TOKEN, contentType: "image/webp" });
        await sql`INSERT INTO mkt_cooking_sprite (ref, url, prompt, updated_at) VALUES (${item.ref}, ${url}, ${prompt}, NOW())
                  ON CONFLICT (ref) DO UPDATE SET url = EXCLUDED.url, prompt = EXCLUDED.prompt, updated_at = NOW()`;
        const u = j.usage || {};
        await sql`INSERT INTO mkt_ai_generation (url, subject, source, size, quality, prompt, ok, tokens_in, tokens_out, origin, label, model, bytes)
                  VALUES (${url}, ${item.ref}, 'marketplace/cooking', '1024x1024', 'low', ${prompt.slice(0, 900)}, true,
                          ${u.input_tokens || null}, ${u.output_tokens || null}, 'admin', ${'Cooking - ' + item.name}, 'gpt-image-1', ${webp.length})`.catch(() => {});
        ok += 1;
        console.log(`  ok ${String(ok + failed).padStart(3)}/${todo.length}  ${item.ref.padEnd(16)} ${item.name}`);
    } catch (e) {
        failed += 1;
        console.log(`  x ${item.ref}: ${String(e?.message || e).slice(0, 120)}`);
    }
}

// A queue drained by POOL workers: each worker takes the next index until there are none left, so a slow image
// never blocks the others and the pool stays full to the last item.
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(POOL, todo.length) }, async () => {
    while (cursor < todo.length) await makeOne(todo[cursor++]);
}));

console.log(`Done. ${ok} generated, ${failed} failed. ~$${(ok * 0.011).toFixed(2)}`);
