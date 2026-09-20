// ── THE TOWN'S HALLOWEEN DRESSING ────────────────────────────────────────────────────────────────────────────
// Nine sprites for the seasonal town: a full moon, two witches, a flock of bats, a dead tree, a jack-o'-lantern,
// a hanging lantern, a cluster of candles and a ghost.
//
// The prompts live in town-art.js beside every other town asset, NOT in here. That is deliberate: the admin
// reroll button reads ART_PROMPTS, so a prompt written in this script would produce art the admin tool could
// never regenerate, and the two would drift the first time one of them was touched. This script only decides
// WHICH keys to draw and at what quality.
//
// Cost, measured off the AI ledger rather than guessed: medium averages $0.047 an image, low $0.011. All nine
// are drawn at MEDIUM — the generateTownArt default — and the tempting saving is a trap here. The documented
// way `low` degrades is a THINNER INK CONTOUR AND A WEAKER SILHOUETTE, and the four far assets are nothing but
// silhouette: tinted near-black against the sky, the outline is the entire drawing. Low would damage precisely
// the one property they are made of. Whole set: about $0.42, once.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-halloween-art.mjs [key ...] [--force]
//
// With no keys it draws whatever is still missing. Naming keys redraws exactly those. --force redraws all.
import fs from "node:fs";

const pick = (text, key) => {
    for (const line of text.split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return null;
};
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
process.env.OPENAI_API_KEY ||= pick(props, "OPENAI_API_KEY") || "";
process.env.DATABASE_URL ||= pick(env, "DATABASE_URL") || "";
process.env.BLOB_READ_WRITE_TOKEN ||= pick(env, "BLOB_READ_WRITE_TOKEN") || "";
if (!process.env.OPENAI_API_KEY.startsWith("sk-")) throw new Error("bad OPENAI_API_KEY in accounting_app/local.properties");
if (!process.env.DATABASE_URL) throw new Error("no DATABASE_URL in accounting_app/.env");
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("no BLOB_READ_WRITE_TOKEN in accounting_app/.env");

const { HALLOWEEN_ART_KEYS, generateTownArt } = await import("@/lib/marketplace/town-art.js");
const { db } = await import("@/lib/db");

const FORCE = process.argv.includes("--force");
const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const bad = asked.filter((k) => !HALLOWEEN_ART_KEYS.includes(k));
if (bad.length) throw new Error(`not a halloween key: ${bad.join(", ")}\nknown: ${HALLOWEEN_ART_KEYS.join(", ")}`);

const have = new Set((await db.query(`SELECT art_key FROM mkt_town_art WHERE art_key = ANY($1)`, [HALLOWEEN_ART_KEYS])
    .catch(() => [])).map((r) => r.art_key));
const todo = (asked.length ? asked : HALLOWEEN_ART_KEYS).filter((k) => FORCE || asked.includes(k) || !have.has(k));

if (!todo.length) {
    console.log(`all ${HALLOWEEN_ART_KEYS.length} halloween assets already drawn. Name keys or pass --force to redraw.`);
    process.exit(0);
}
console.log(`drawing ${todo.length}: ${todo.join(", ")}\n`);

const failed = [];
for (const key of todo) {
    const started = Date.now();
    try {
        const url = await generateTownArt(key);
        console.log(`  ok    ${key.padEnd(14)} ${((Date.now() - started) / 1000).toFixed(1)}s  ${url}`);
    } catch (error) {
        // ⚠️ ONE REFUSAL MUST NOT COST THE OTHER EIGHT. A failure here is usually a content refusal on one
        // prompt, and aborting the run would throw away the images that already succeeded — which then get
        // redrawn, and paid for, on the next attempt.
        failed.push(key);
        console.log(`  FAIL  ${key.padEnd(14)} ${String(error?.message || error).slice(0, 160)}`);
    }
}
console.log(`\n${todo.length - failed.length}/${todo.length} drawn${failed.length ? `; retry: ${failed.join(" ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
