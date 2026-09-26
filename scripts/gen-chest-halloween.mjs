// ── THE FOUR HALLOWEEN CHEST ICONS ───────────────────────────────────────────────────────────────────────
//
//   node scripts/gen-chest-halloween.mjs            generate any that are missing
//   node scripts/gen-chest-halloween.mjs --force    redraw all four (costs another generation each)
//   node scripts/gen-chest-halloween.mjs --dry      print the prompts and the price, generate nothing
//
// Chest icons live in SETTINGS as Blob URLs (key `chest_art`), not in public/images — that is how the other
// eight got there and how the equipment screen finds them. So this uploads to Blob and merges the setting,
// exactly like generateChestArt does on the server.
//
// ⚠️ THE PROMPTS ARE NOT IN THIS FILE. They are in chest-art-prompts.js, which the cron and the admin
// regenerate button read too — a generator carrying its own copy of the prose is a second look for the same
// object the first time anybody edits one of them.
//
// ⚠️ QUALITY IS `low`, AND THAT IS DELIBERATE. It is what the other eight chests were drawn at (see
// generateChestArt) and what the house default is. A Halloween chest generated at medium sits in a row with
// eight low ones and reads as belonging to a different set — matching the neighbours beats being sharper.
//
// COST: 4 images at low, 1024x1024 — about 2 cents each, 8 cents the lot.
import { readFileSync } from "node:fs";
import path from "node:path";

import { put } from "@vercel/blob";
import { Pool } from "@neondatabase/serverless";
import sharp from "sharp";

import { HALLOWEEN_CHEST_PROMPTS, HALLOWEEN_CHEST_TIERS } from "../src/lib/marketplace/chest-art-prompts.js";

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

// Same fallback chain publish-app.mjs uses: the env first, then Luke's real secrets next door.
function secret(name, file = "../accounting_app/.env") {
    if (process.env[name]) return process.env[name].trim();
    try {
        const m = readFileSync(path.resolve(file), "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
        if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* not there */ }
    return null;
}

const KEY = secret("OPENAI_API_KEY", "../accounting_app/local.properties");
const BLOB = secret("BLOB_READ_WRITE_TOKEN");
const DB = secret("DATABASE_URL");
if (!DRY && (!KEY || !BLOB || !DB)) {
    throw new Error(`missing secrets: ${[!KEY && "OPENAI_API_KEY", !BLOB && "BLOB_READ_WRITE_TOKEN", !DB && "DATABASE_URL"].filter(Boolean).join(", ")}`);
}

if (DRY) {
    for (const t of HALLOWEEN_CHEST_TIERS) {
        console.log(`\n── ${t} ──\n${HALLOWEEN_CHEST_PROMPTS[t].slice(0, 400)}...`);
    }
    console.log(`\n${HALLOWEEN_CHEST_TIERS.length} images at low quality ≈ $${(HALLOWEEN_CHEST_TIERS.length * 0.02).toFixed(2)}. Nothing generated.`);
    process.exit(0);
}

const pool = new Pool({ connectionString: DB });
const readArt = async () => {
    const { rows } = await pool.query(`SELECT value FROM mkt_setting WHERE key = 'chest_art'`);
    const raw = rows[0]?.value;
    if (!raw) return {};
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
};

const art = await readArt();
const todo = HALLOWEEN_CHEST_TIERS.filter((t) => FORCE || !art[t]);
if (!todo.length) {
    console.log("all four already drawn — pass --force to redraw.");
    await pool.end();
    process.exit(0);
}
console.log(`generating ${todo.length} chest icon(s) at low (~$${(todo.length * 0.02).toFixed(2)})...`);

for (const tier of todo) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: HALLOWEEN_CHEST_PROMPTS[tier],
            size: "1024x1024", background: "transparent", quality: "low", n: 1,
        }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${tier}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);

    // Same downscale + WebP the server's storeImage does, so these files match the other eight on the wire.
    const out = await sharp(Buffer.from(body.data[0].b64_json, "base64"))
        .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88, effort: 5 })
        .toBuffer();
    const blob = await put(`marketplace/chest/${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`, out, {
        access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000, token: BLOB,
    });
    art[tier] = blob.url;
    console.log(`  ${tier.padEnd(14)} ${(out.length / 1024).toFixed(0)}KB  ${blob.url}`);
}

// Merge, never replace: the other eight tiers live in the same row.
await pool.query(
    `INSERT INTO mkt_setting (key, value, updated_at) VALUES ('chest_art', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(art)],
);
await pool.end();
console.log(`\nstored. chest_art now holds ${Object.keys(art).length} tiers.`);
