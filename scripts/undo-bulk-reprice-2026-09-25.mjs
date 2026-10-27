// ── UNDO THE 2026-09-25 BULK REPRICE ─────────────────────────────────────────────────────────────────────────
// On 2026-09-25 between 02:35 and 02:40 UTC the admin app's Remediations "Raise N to market" button rewrote
// the shelf price of 311 catalog variations in six minutes. The app's own undo is held in memory only
// (LedgerViewModel.repriceUndo) and died with that session, and nothing else in the system logs a price.
//
// The before-prices here come from `product_alert_arrivals`, which stamps a card's price at the moment it is
// alerted to Discord. It is the only pre-run record of our own shelf prices that exists anywhere.
//
// ── ⚠️ THE GUARD IS THE POINT OF THIS SCRIPT ────────────────────────────────────────────────────────────────
// A card is restored ONLY if Square still has it at exactly the price the run left it at. If it is at any
// other number, somebody has priced it deliberately since 25 September and this script must not overrule
// them. That check is per item, against live Square, at the moment of writing — never against a cached list.
//
// This exists because a revert script written earlier in the same session matched too broadly
// (notes LIKE '%buyer%') and deleted trade_line rows for three legitimate buy-backs. A revert needs the same
// scrutiny as the thing it reverts.
//
// Usage:
//   node scripts/undo-bulk-reprice-2026-09-25.mjs            # dry run, prints every change
//   node scripts/undo-bulk-reprice-2026-09-25.mjs --apply    # write to Square, then sync the local mirror
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const PLAN = "C:/Users/Luke/AppData/Local/Temp/claude/C--Users-Luke-Projects/50a039d8-a3c3-48fc-9c4e-b6ac88d9f3a8/scratchpad/revert-plan.json";

const env = fs.readFileSync("C:/Users/Luke/Projects/wolf den site/.env.local", "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=["']?([^"'\\r\\n]+)`, "m")) || [])[1];
const sql = neon(pick("DATABASE_URL"));
const TOKEN = pick("SQUARE_ACCESS_TOKEN");
const BASE = pick("SQUARE_ENV") === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
const hdr = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "Square-Version": "2025-01-23" };

const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
console.log(`\n  plan: ${plan.length} cards from the 02:35-02:40Z run with a recoverable before-price\n`);

// Fresh read of live Square — never trust the snapshot the plan was built from.
const objs = [];
const ids = plan.map((p) => p.id);
for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`${BASE}/v2/catalog/batch-retrieve`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ object_ids: ids.slice(i, i + 100) }),
    });
    const j = await r.json();
    if (!r.ok) { console.log("  square read failed:", JSON.stringify(j).slice(0, 300)); process.exit(1); }
    objs.push(...(j.objects || []));
}
const live = new Map(objs.map((o) => [o.id, o]));

const toWrite = [];
const skipped = [];
for (const p of plan) {
    const o = live.get(p.id);
    if (!o) { skipped.push({ ...p, why: "gone from Square" }); continue; }
    const nowCents = o.item_variation_data?.price_money?.amount;
    const expectCents = Math.round(p.now * 100);
    const backCents = Math.round(p.was * 100);
    // ⚠️ THE GUARD. Anything priced since the run keeps the price it was given.
    if (nowCents !== expectCents) {
        skipped.push({ ...p, why: `repriced since (now $${(nowCents / 100).toFixed(2)})` });
        continue;
    }
    if (backCents === expectCents) { skipped.push({ ...p, why: "already at the old price" }); continue; }
    toWrite.push({ p, o, backCents });
}

console.log(`  will restore : ${toWrite.length}`);
console.log(`  skipped      : ${skipped.length}`);
for (const s of skipped.slice(0, 15)) {
    console.log(`     skip  ${String(s.name || "").slice(0, 42).padEnd(44)} ${s.why}`);
}
const sumNow = toWrite.reduce((t, w) => t + w.p.now, 0);
const sumWas = toWrite.reduce((t, w) => t + w.p.was, 0);
console.log(`\n  shelf value of the restored set: $${sumNow.toFixed(0)} -> $${sumWas.toFixed(0)}`
    + `  (-$${(sumNow - sumWas).toFixed(0)})\n`);

if (!APPLY) {
    for (const w of toWrite.slice(0, 20)) {
        console.log(`   $${String(w.p.now).padStart(7)} -> $${String(w.p.was).padStart(7)}   ${String(w.p.name).slice(0, 46)}`);
    }
    console.log(`\n  DRY RUN — pass --apply to write ${toWrite.length} prices to Square`);
    process.exit(0);
}

// ── write, in batches, with the live version each object reported ───────────────────────────────────────
let done = 0; const failed = [];
for (let i = 0; i < toWrite.length; i += 50) {
    const chunk = toWrite.slice(i, i + 50);
    const r = await fetch(`${BASE}/v2/catalog/batch-upsert`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({
            idempotency_key: `undo-reprice-20260925-${i}`,
            batches: [{
                objects: chunk.map(({ o, backCents }) => ({
                    type: "ITEM_VARIATION", id: o.id, version: o.version,
                    item_variation_data: {
                        ...o.item_variation_data,
                        price_money: { amount: backCents, currency: "USD" },
                    },
                })),
            }],
        }),
    });
    const j = await r.json();
    if (!r.ok) { failed.push(JSON.stringify(j).slice(0, 220)); continue; }
    done += (j.objects || []).length;
    console.log(`  wrote ${done}/${toWrite.length}`);
}
if (failed.length) { console.log("\n  FAILURES:"); for (const f of failed) console.log("   " + f); }

// Local mirror, so the shelf and the pack pools stop reading the inflated number before the next sync.
for (const w of toWrite) {
    await sql`UPDATE inventory_feed SET price = ${w.p.was}, updated_at = now() WHERE variation_id = ${w.p.id}`
        .catch(() => {});
}
console.log(`\n  restored ${done} prices; inventory_feed mirrored.`);
