// The chest fragment is 38% of the fishing treasure table — the single most common thing the sea gives up —
// and it was rendering as a bare 🔷 emoji at 96px in the reveal modal. The most frequent reward looked the
// cheapest. This draws it properly, in the house style, and stores it as town art like every other sprite.
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { housePrompt, SMALL_ICON_EXTRA } from "../src/lib/marketplace/art-style.js";

const env = (k) => (readFileSync("../accounting_app/.env", "utf8").match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const key = readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8").match(/OPENAI_API_KEY=(.+)/)[1].trim();
const sql = neon(env("DATABASE_URL"));

const SUBJECT =
    "A single broken shard of an ornate treasure chest — a jagged piece of dark lacquered wood banded with " +
    "tarnished gold filigree and one rivet, edges freshly splintered, a faint blue-green glow seeping from the " +
    "break as though the chest's magic is still leaking out of it";

const prompt = housePrompt(SUBJECT, { extra: SMALL_ICON_EXTRA });
const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
});
if (!r.ok) { console.error("failed:", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const raw = Buffer.from((await r.json()).data[0].b64_json, "base64");
const out = await sharp(raw).resize({ width: 448, withoutEnlargement: true }).webp({ quality: 88, effort: 5 }).toBuffer();
const blob = await put(`marketplace/town/chest-fragment-${Date.now()}.webp`, out, {
    access: "public", token: env("BLOB_READ_WRITE_TOKEN"), contentType: "image/webp", cacheControlMaxAge: 31536000,
});
await sql.query(
    `INSERT INTO mkt_town_art (art_key, url, updated_at) VALUES ('chest_fragment', $1, NOW())
     ON CONFLICT (art_key) DO UPDATE SET url = $1, updated_at = NOW()`,
    [blob.url],
);
console.log("stored chest_fragment:", blob.url, `(${Math.round(out.length / 1024)} KB)`);
