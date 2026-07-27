// One-off: generate AI die-cut sprites for badges that don't have one yet (or a given list of slugs), storing
// them in mkt_badge_sprite + Vercel Blob — mirroring src/lib/marketplace/badge-sprites.js buildBadgePrompt.
// Usage: node scripts/gen-badge-sprites.mjs [slug1 slug2 …]   (no args = every badge missing art)
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

// ── secrets: OpenAI key from the Android local.properties; DB + blob token from accounting_app/.env ──
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const OPENAI_KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const DB_URL = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const BLOB_TOKEN = env.match(/^BLOB_READ_WRITE_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!OPENAI_KEY) throw new Error("no OPENAI_API_KEY");
if (!DB_URL) throw new Error("no DATABASE_URL");
if (!BLOB_TOKEN) throw new Error("no BLOB_READ_WRITE_TOKEN");

const sql = neon(DB_URL);

function buildBadgePrompt(badge) {
    const theme = [badge.label, badge.description].filter(Boolean).join(" — ");
    return (
        `Flat 2D game achievement badge emblem representing: "${theme}". ` +
        `A single bold centered emblem / crest that fills most of the frame, clean confident outlines, ` +
        `cel-shaded flat vibrant colors, strong readable silhouette, fantasy trading-card-game / RPG achievement ` +
        `art style. Dominant accent color ${badge.color || "#c8a24a"}. ` +
        `Die-cut on a FULLY TRANSPARENT background — nothing behind it: no backdrop, no scene, no glow, no ` +
        `vignette, no drop shadow, no card, no frame. No text, no letters, no numbers, no logo, no watermark, ` +
        `no border ring. Must stay clearly legible shrunk to 24 pixels.`
    );
}

async function genOne(badge) {
    const prompt = buildBadgePrompt(badge);
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image");
    const buf = Buffer.from(b64, "base64");
    const { url } = await put(`marketplace/badges/${badge.slug}-${Date.now()}.png`, buf, { access: "public", token: BLOB_TOKEN, contentType: "image/png" });
    await sql`INSERT INTO mkt_badge_sprite (slug, url, prompt, updated_at) VALUES (${badge.slug}, ${url}, ${prompt}, NOW())
              ON CONFLICT (slug) DO UPDATE SET url = EXCLUDED.url, prompt = EXCLUDED.prompt, updated_at = NOW()`;
    return url;
}

const argv = process.argv.slice(2);
const badges = argv.length
    ? await sql`SELECT slug, label, description, icon, color FROM mkt_badge WHERE slug = ANY(${argv})`
    : await sql`SELECT b.slug, b.label, b.description, b.icon, b.color FROM mkt_badge b
                 LEFT JOIN mkt_badge_sprite s ON s.slug = b.slug WHERE s.slug IS NULL ORDER BY b.slug`;

console.log(`Generating ${badges.length} badge sprite(s)…`);
let ok = 0;
for (const b of badges) {
    try { const url = await genOne(b); ok += 1; console.log(`  ✓ ${b.slug} → ${url}`); }
    catch (e) { console.error(`  ✗ ${b.slug}: ${e.message}`); }
}
console.log(`Done. ${ok}/${badges.length} generated.`);
