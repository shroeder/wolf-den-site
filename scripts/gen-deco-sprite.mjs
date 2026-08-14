// ── DRAW ONE DECORATION, THROUGH THE GAME'S OWN PIPELINE ─────────────────────────────────────────────────────
// Runs generateDecorationSprite() itself via the alias loader rather than reimplementing it. That matters more
// here than in most scripts: the prompt is composed by housePrompt() in art-style.js, and the post-processing
// (de-halo, resize to 512, transparent die-cut) is what keeps a new sprite looking like it belongs beside the
// 153 already drawn. A script with its own copy of either would produce art that is subtly not the house style
// and nobody would be able to say why.
//
// Usage:
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-deco-sprite.mjs deco_petting_stand
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-deco-sprite.mjs deco_petting_stand --quality medium
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-deco-sprite.mjs deco_petting_stand --dry
//
// QUALITY. The shared pipeline draws decorations at `low`, which is the right call for a hundred-odd props that
// render at ~120px and are handed out free. It is the wrong call for one somebody paid five dollars for — the
// same reasoning that buys Creations a better draw. `--quality medium` is roughly a few cents; price it before
// you run it across a batch.
import { readFileSync } from "node:fs";

const env = readFileSync("../accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
process.env.BLOB_READ_WRITE_TOKEN ||= env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
process.env.OPENAI_API_KEY ||= readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8")
    .match(/^OPENAI_API_KEY=(.*)$/m)[1].trim();

const realLog = console.log;
console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith('{"timestamp"')) return; realLog(...a); };

const arg = (flag, dflt = null) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : dflt; };
const decoId = process.argv[2];
const DRY = process.argv.includes("--dry");
const QUALITY = arg("--quality", "medium");
if (!decoId || decoId.startsWith("--")) { realLog("usage: gen-deco-sprite.mjs <deco_id> [--quality low|medium] [--dry]"); process.exit(1); }

const { decorationById } = await import("@/lib/marketplace/decorations.js");
const def = decorationById(decoId);
if (!def) { realLog(`no such decoration: ${decoId}`); process.exit(1); }

realLog(`\n${def.name}  (${def.id})`);
realLog(`rarity ${def.rarity} · source ${def.source}\n`);
realLog("PROMPT SENT TO THE MODEL:\n");
realLog(def.prompt);
realLog("");

if (DRY) { realLog("--dry: nothing generated, nothing stored."); process.exit(0); }

// The real thing: generates, de-haloes, resizes, uploads to Blob, upserts mkt_deco_sprite, logs the spend.
const { generateImage } = await import("@/lib/marketplace/openai-image.js");
const { db } = await import("@/lib/db");

const url = await generateImage(def.prompt, {
    size: "1024x1024",
    quality: QUALITY,
    pathPrefix: "marketplace/decorations",
    resizeTo: 512,
    deHalo: true,
    meta: { origin: "script", subject: def.id, label: `Decoration — ${def.name}` },
});
if (!url) { realLog("generation failed — nothing stored."); process.exit(1); }

await db.query(
    `INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (deco_id) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`,
    [def.id, url]
);
realLog(`stored: ${url}`);
