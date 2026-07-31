/**
 * Reconstruct the AI generation history for art that already exists.
 *
 * The ledger (migration 293) only records generations from the moment it was added. Everything drawn before
 * that — every pet, item, badge, decoration, town sprite — has no row, so the history would open almost empty.
 * We do know what was drawn, where it was stored and (mostly) when, so those rows can be rebuilt.
 *
 * What we CANNOT know after the fact is the quality tier each was generated at, so cost here is inferred from
 * the tier each generator was configured to use. Every backfilled row is written with cost_basis='estimated'
 * and the screen shows them as estimates. Rows recorded live are 'measured'. Do not let those blur together —
 * an estimate presented as a measurement is worse than no number.
 *
 * Timestamps come from each table's updated_at, which is when the row was last touched — close to the draw
 * date for art that was written once and never revised, approximate for anything re-oriented or restyled since.
 * Good enough to order a history; not something to audit a bill against, which is what cost_basis flags.
 *
 * Idempotent: keyed on the stored URL (unique index), so re-running adds nothing.
 *
 * Usage:
 *   node scripts/backfill-ai-ledger.mjs           # dry run
 *   node scripts/backfill-ai-ledger.mjs --apply
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
function secret(k) {
    if (process.env[k]) return process.env[k];
    for (const p of ["../accounting_app/.env", ".env"]) {
        try { const m = readFileSync(p, "utf8").match(new RegExp(`^${k}=(.+)$`, "m")); if (m) return m[1].trim(); } catch { /* next */ }
    }
    return null;
}
const sql = neon(secret("DATABASE_URL"));

const TOKENS = { "1024x1024": { low: 272, medium: 1056, high: 4160 }, "1536x1024": { low: 400, medium: 1568, high: 6208 } };
const cost = (size, q) => Math.round(((TOKENS[size] || TOKENS["1024x1024"])[q] ?? 1056) * (40 / 1e6) * 1e5) / 1e5;

// [table, urlColumn, dateColumn|null, source, quality, size, origin, labelSql, subjectSql, buyerColumn|null]
// quality is what that generator was configured to use at the time — see the per-caller settings in
// openai-image.js callers and the gen-*.mjs scripts.
const JOBS = [
    ["mkt_pet_sprite", "url", "updated_at", "marketplace/pet", "medium", "1024x1024", "cron", "'Pet sprite — ' || COALESCE(pet_id,'?')", "pet_id", null],
    ["mkt_pet_sprite_level", "url", "updated_at", "marketplace/pet", "medium", "1024x1024", "cron", "'Pet level art — ' || COALESCE(pet_id,'?') || ' lv' || COALESCE(level::text,'?')", "pet_id", null],
    ["mkt_item_sprite", "url", "updated_at", "marketplace/items", "medium", "1024x1024", "cron", "'Gear — ' || COALESCE(item_id,'?')", "item_id", null],
    ["mkt_badge_sprite", "url", "updated_at", "marketplace/badges", "low", "1024x1024", "cron", "'Badge — ' || COALESCE(slug,'?')", "slug", null],
    ["mkt_deco_sprite", "url", "updated_at", "marketplace/decorations", "medium", "1024x1024", "batch", "'Decoration — ' || COALESCE(deco_id,'?')", "deco_id", null],
    ["mkt_consumable_sprite", "url", "updated_at", "marketplace/consumables", "medium", "1024x1024", "cron", "'Consumable — ' || COALESCE(consumable_id,'?')", "consumable_id", null],
    ["mkt_town_art", "url", "updated_at", "marketplace/town", "medium", "1024x1024", "admin", "'Town art — ' || COALESCE(art_key,'?')", "art_key", null],
    ["mkt_farm_bg", "url", "created_at", "marketplace/farm-bg", "medium", "1536x1024", "member", "'Farm background'", "NULL", "buyer_id"],
    ["mkt_custom_deco", "chosen_url", "created_at", "marketplace/decorations/custom", "medium", "1024x1024", "creation", "'Creation — ' || COALESCE(name,'?')", "name", "buyer_id"],
    ["boss_event", "image_url", null, "marketplace/boss", "medium", "1024x1024", "admin", "'Boss — ' || COALESCE(name,'?')", "name", null],
    ["boss_event", "background_url", null, "marketplace/boss-bg", "medium", "1536x1024", "admin", "'Boss background — ' || COALESCE(name,'?')", "name", null],
    ["mkt_buyer", "avatar_sprite_url", null, "marketplace/sprite", "medium", "1024x1024", "member", "'Hero sprite'", "NULL", "id"],
];

let planned = 0;
let plannedCost = 0;
const failures = [];
for (const [table, col, dateCol, source, quality, size, origin, labelSql, subjectSql, buyerCol] of JOBS) {
    const c = cost(size, quality);
    let rows;
    try {
        rows = await sql.query(
            `SELECT "${col}" AS url,
                    ${dateCol ? `"${dateCol}"` : "NULL::timestamptz"} AS created_at,
                    ${labelSql} AS label,
                    ${subjectSql === "NULL" ? "NULL::text" : `${subjectSql}::text`} AS subject
                    ${buyerCol ? `, "${buyerCol}"::text AS buyer_id` : ", NULL::text AS buyer_id"}
             FROM "${table}"
             WHERE "${col}" IS NOT NULL AND "${col}" <> ''
               AND NOT EXISTS (SELECT 1 FROM mkt_ai_generation g WHERE g.url = "${table}"."${col}")`,
        );
    } catch (e) { console.log(`  skip ${table}.${col}: ${String(e.message).slice(0, 90)}`); continue; }
    if (!rows.length) continue;
    console.log(`  ${(table + "." + col).padEnd(34)} ${String(rows.length).padStart(4)} × $${c.toFixed(3)} = $${(rows.length * c).toFixed(2)}  [${quality}]`);
    planned += rows.length;
    plannedCost += rows.length * c;
    if (!APPLY) continue;

    // One batch id per source, so reconstructed art groups as "the pet sprite set" rather than 372 loose rows
    // pretending to be individual events we witnessed.
    const batchId = `backfill:${table}.${col}`;
    for (const r of rows) {
        let label = r.buyer_id;
        if (label) {
            const b = await sql.query(`SELECT alias, display_name FROM mkt_buyer WHERE id = $1`, [r.buyer_id]).catch(() => []);
            label = b[0]?.alias ? `@${b[0].alias}` : (b[0]?.display_name || null);
        }
        await sql.query(
            `INSERT INTO mkt_ai_generation
                (created_at, model, size, quality, source, label, subject, url, origin, batch_id, batch_label,
                 buyer_id, buyer_label, ok, cost_usd, cost_basis)
             VALUES (COALESCE($1, now()), 'gpt-image-1', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, $13, 'estimated')
             ON CONFLICT (url) DO NOTHING`,
            [r.created_at, size, quality, source, r.label, r.subject, r.url, origin, batchId,
                `Existing ${source.split("/").pop()} art`, r.buyer_id || null, label, c],
        ).catch((e) => {
            // Do NOT swallow. A silent catch here already once reported "backfilled 1345 rows" while inserting
            // nothing, because ON CONFLICT couldn't match a partial index.
            if (!failures.length) console.log(`  ! insert failed: ${e.message}`);
            failures.push(e.message);
        });
    }
}

console.log(`\n${planned} rows, ~$${plannedCost.toFixed(2)} of historical spend.`);
if (APPLY) {
    const written = (await sql.query(`SELECT count(*)::int n FROM mkt_ai_generation WHERE cost_basis = 'estimated'`))[0].n;
    console.log(`Backfilled — ${written} rows now in the ledger (all cost_basis='estimated')${failures.length ? `, ${failures.length} failed` : ""}.`);
} else {
    console.log("DRY RUN — re-run with --apply.");
}
