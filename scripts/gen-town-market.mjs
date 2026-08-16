// ── THE MARKET'S TOWN SPRITE ─────────────────────────────────────────────────────────────────────────────────
// One building sprite for the new Market stall on the town street. The prompt is READ OUT OF town-art.js rather
// than written here, so the admin regenerate button and this script can never draw two different buildings —
// the same reason the cooking generator parses its catalogue out of cooking.js.
//
// MEDIUM quality: this renders at ~244px on the street, which is well past the point where `low` starts showing
// mush in the produce, and it is one image, once. `deHalo` is skipped because gpt-image-1's transparent output
// is already a clean cutout at this size — the white-rim problem comes from PROMPTING for a rim, and the house
// prompt forbids it.
//
// Usage: node scripts/gen-town-market.mjs [key]     (default key: market)
import fs from "node:fs";

import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";

import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

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

const KEY = process.argv[2] || "market";

// Pull the prompt straight out of the source of truth. BUILDING_STYLE is a template value in that file, so it
// is resolved the same way the module resolves it — by reading the constant and substituting it.
const src = fs.readFileSync("src/lib/marketplace/town-art.js", "utf8");
const style = src.match(/const BUILDING_STYLE =\s*\n?\s*"([^]*?)";/)?.[1];
const raw = src.match(new RegExp(`^\\s{4}${KEY}: \`([^]*?)\`,$`, "m"))?.[1];
if (!style) throw new Error("could not read BUILDING_STYLE out of town-art.js");
if (!raw) throw new Error(`no ART_PROMPTS entry named "${KEY}" in town-art.js`);
const prompt = raw.replace("${BUILDING_STYLE}", style);
console.log(`${KEY}: ${prompt.slice(0, 120)}…\n`);

const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
});
const j = await res.json();
if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);

const buf = Buffer.from(j.data[0].b64_json, "base64");
// TRIM FIRST. The model centres the building in a square and leaves transparent margin all round; without the
// trim the sprite renders smaller than its neighbours on the street for no reason anyone can see.
const webp = await sharp(buf).trim({ threshold: 10 }).resize({ width: 512, withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toBuffer();
const { url } = await put(`marketplace/town/${KEY}-${Date.now()}.webp`, webp, { access: "public", token: BLOB_TOKEN, contentType: "image/webp" });

await sql`INSERT INTO mkt_town_art (art_key, url, updated_at) VALUES (${KEY}, ${url}, NOW())
          ON CONFLICT (art_key) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`;

const u = j.usage || {};
await sql`INSERT INTO mkt_ai_generation (url, subject, source, size, quality, prompt, ok, tokens_in, tokens_out, origin, label, model, bytes)
          VALUES (${url}, ${KEY}, 'marketplace/town', '1024x1024', 'medium', ${prompt.slice(0, 900)}, true,
                  ${u.input_tokens || null}, ${u.output_tokens || null}, 'admin', ${'Town art - ' + KEY}, 'gpt-image-1', ${webp.length})`.catch(() => {});

console.log(`ok  ${KEY} → ${url}  (${Math.round(webp.length / 1024)}kb)`);
