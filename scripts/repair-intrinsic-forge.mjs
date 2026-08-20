// ── THE THREE PIECES THE FORGE INFLATED ──────────────────────────────────────────────────────────────────────
// `apply` added ONE WHOLE POINT to whatever stat it was handed, and the affix pool included the item's own
// numbers. For a stat counted in points that is correct. For the two that are not:
//
//   speed          runs 0.87 to 2.33 across the whole Den. A Heavy Cleaver went to 3.93/s — four times the
//                  attack rate, so four times the damage output, off one enhance.
//   block_chance   is stored 0..1. A shield went to 220% block.
//
// The cause is fixed (crafting.js filters isIntrinsicStat out of the affix pool). This repairs what it already
// wrote. THE POINTS ARE MOVED, NOT DELETED — the enhances were genuinely earned, and it is only the stat they
// landed on that was never legitimate. Same rule a reforge follows: the value comes with it in full.
//
// Weapons move to Might, shields to Tenacity: the affix on that kind of piece that does the same JOB as the
// number it is leaving, so nobody has to re-plan a build around the repair.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/repair-intrinsic-forge.mjs [--apply]
import { db } from "../src/lib/db.js";
import { itemById, isIntrinsicStat } from "../src/lib/marketplace/items.js";

const APPLY = process.argv.includes("--apply");

const MOVE_TO = { speed: "might", block_chance: "tenacity", base_damage: "might", armor: "tenacity" };

const rows = await db.query(`SELECT e.buyer_id, e.item_id, e.stat_bonus, b.display_name
    FROM mkt_item_enhance e JOIN mkt_buyer b ON b.id = e.buyer_id`);

const fixes = [];
for (const r of rows) {
    const bonus = typeof r.stat_bonus === "string" ? JSON.parse(r.stat_bonus) : (r.stat_bonus || {});
    // base_damage and armor are LEFT ALONE. They are raised on purpose by the proportional lift in
    // enhanceItem, so their forged value is mostly legitimate and there is no way to tell from here which
    // part of it came from the double-dip. Only the two that are counted in something other than points —
    // and are therefore unambiguously wrong at any value — are moved.
    const bad = Object.keys(bonus).filter((k) => isIntrinsicStat(k) && (k === "speed" || k === "block_chance"));
    if (!bad.length) continue;
    const item = itemById(r.item_id);
    const next = { ...bonus };
    const moves = [];
    for (const k of bad) {
        const n = Number(next[k]) || 0;
        delete next[k];
        const to = MOVE_TO[k] || "might";
        next[to] = (Number(next[to]) || 0) + n;
        moves.push(`${n} ${k} -> ${to}`);
    }
    fixes.push({ ...r, name: item?.name || r.item_id, base: item?.stats || {}, bonus, next, moves });
}

console.log(`\n  ${fixes.length} piece(s) to repair.\n`);
for (const f of fixes) {
    const k = Object.keys(f.bonus).find((x) => x === "speed" || x === "block_chance");
    const was = (Number(f.base[k]) || 0) + (Number(f.bonus[k]) || 0);
    console.log(`  ${String(f.display_name).slice(0, 18).padEnd(19)} ${String(f.name).slice(0, 22).padEnd(23)} ${k} ${f.base[k]} + ${f.bonus[k]} = ${was}  ->  back to ${f.base[k]}`);
    console.log(`      moved: ${f.moves.join(", ")}`);
}

if (!APPLY) { console.log("\n  dry run — pass --apply to write\n"); process.exit(0); }

for (const f of fixes) {
    await db.query(
        `UPDATE mkt_item_enhance SET stat_bonus = $3::jsonb, updated_at = NOW() WHERE buyer_id = $1 AND item_id = $2`,
        [f.buyer_id, f.item_id, JSON.stringify(f.next)]
    );
}
console.log(`\n  repaired ${fixes.length}.\n`);
process.exit(0);
