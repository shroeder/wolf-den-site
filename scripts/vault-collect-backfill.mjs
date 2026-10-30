/**
 * ── THE ONE-OFF: CARDS ALREADY IN SOMEBODY'S HANDS ──────────────────────────────────────────────────────────
 *
 * The forward fix (migrations/501, the packs queue route and the shop order route) closes both doors from
 * here on. It cannot help the cards that were handed over BEFORE it existed: those are still 'held', still
 * listed in their owner's vault, and still carrying a live sell-back price.
 *
 * Luke: "backfill the fix so that Anna Marisa's cards are all picked up now so that she can't sell them."
 *
 * ⚠️ DRY RUN BY DEFAULT. It prints exactly what it would collect and changes nothing without --apply.
 *
 *   node scripts/vault-collect-backfill.mjs --member Anamarisa
 *   node scripts/vault-collect-backfill.mjs --member Anamarisa --apply
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes("--apply");
const MEMBER = arg("--member");

if (!MEMBER) {
    console.error("--member <display name> is required. This never runs across every member at once:\n" +
        "'already collected' is a fact about one person's visit, not something to infer in bulk.");
    process.exit(1);
}

const [buyer] = await sql`
    SELECT id, display_name FROM mkt_buyer
    WHERE display_name ILIKE ${"%" + MEMBER + "%"} OR alias ILIKE ${"%" + MEMBER + "%"} LIMIT 2`;
if (!buyer) { console.error(`No member matching "${MEMBER}".`); process.exit(1); }

const cards = await sql`
    SELECT id, card_name, set_name, condition, current_value_cents, created_at
    FROM mkt_vault_card
    WHERE buyer_id = ${buyer.id} AND status IN ('held', 'on_order')
    ORDER BY created_at`;

const total = cards.reduce((a, c) => a + c.current_value_cents, 0);
console.log(`${buyer.display_name} — ${cards.length} card(s) still in the vault, $${(total / 100).toFixed(2)} of sell-back exposure\n`);
for (const c of cards) {
    console.log(`  ${String(c.id).slice(0, 8)}  ${(c.card_name || "").slice(0, 34).padEnd(35)} $${(c.current_value_cents / 100).toFixed(2).padStart(7)}`);
}
if (!cards.length) { console.log("\nNothing to do."); process.exit(0); }

if (!APPLY) {
    console.log(`\nDRY RUN. Re-run with --apply to mark these collected.`);
    process.exit(0);
}

// Same shape the live path writes, so a backfilled row is indistinguishable from one closed by staff
// tomorrow -- except for collected_by, which says plainly that this was a backfill and not a scan.
const done = await sql`
    UPDATE mkt_vault_card
    SET status = 'collected', collected_at = NOW(), collected_by = 'backfill-2026-10-29', updated_at = NOW()
    WHERE buyer_id = ${buyer.id} AND status IN ('held', 'on_order')
    RETURNING id, card_name, current_value_cents`;

for (const r of done) {
    await sql`
        INSERT INTO mkt_vault_event (buyer_id, action, credit_delta_cents, meta)
        VALUES (${buyer.id}, 'collected', 0,
                ${JSON.stringify({ card: r.card_name, valueCents: r.current_value_cents, by: "backfill-2026-10-29" })})`;
}

console.log(`\n✓ collected ${done.length} card(s) — $${(done.reduce((a, c) => a + c.current_value_cents, 0) / 100).toFixed(2)} no longer sellable.`);
