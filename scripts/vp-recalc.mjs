// ── REBUILD EVERY MEMBER'S VP FROM THE REAL BOUT HISTORY ──────────────────────────────────────────────────────
// VP_SCALE moved 3000 → 400 and VP_K 300 → 32, and existing ratings are on the old scale: a 2,000-point gap
// reads as a near-certainty at 400, so leaving the numbers alone would have made the new curve nonsense. The
// honest migration is not to compress them — that would keep the ordering the old constants produced, which is
// the thing being fixed — but to replay what actually happened under the new ones. Same method as the Road rung
// restoration: checked against the record of the climb rather than estimated.
//
// vpTransfer is IMPORTED, never copied, so this and the live settle cannot disagree. Dry run by default; writes
// a rollback file before it touches anything.
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db.js";
import { vpTransfer, VP_SCALE, VP_K } from "@/lib/marketplace/arena-rewards.js";

const APPLY = process.argv.includes("--apply");
const SEED = 1200;

const rows = await db.query(
  `SELECT challenger_id c, defender_id d, challenger_won w FROM mkt_arena_bout
    WHERE defender_id IS NOT NULL AND COALESCE(rung,0) = 0 AND COALESCE(npc_tier,0) = 0
    ORDER BY created_at ASC, id ASC`);

const vp = new Map();
// The HIGHEST they ever stood along the way, not where they finished. The Trophy Room's "Best VP held" is a
// record, and a record that reports a final balance instead of a high-water mark would fall every time
// somebody had a bad night — the exact fault just fixed on Gems cut.
const best = new Map();
const get = (id) => (vp.has(id) ? vp.get(id) : SEED);
const set = (id, v) => { vp.set(id, v); if (v > (best.get(id) ?? SEED)) best.set(id, v); };
for (const b of rows) {
  const a = get(b.c), e = get(b.d), won = Boolean(b.w);
  // The SAME cap the live settle applies: you cannot take more than they have, or lose more than you own.
  const move = Math.min(vpTransfer({ myVp: a, theirVp: e, won }), won ? e : a);
  set(b.c, Math.max(0, a + (won ? move : -move)));
  set(b.d, Math.max(0, e + (won ? -move : move)));
}

const live = await db.query(`SELECT a.buyer_id, a.vp::int vp, a.best_vp::int best, b.display_name
  FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id`);
const changes = live
  .filter((r) => vp.has(r.buyer_id))
  .map((r) => ({ id: r.buyer_id, name: r.display_name, from: r.vp, to: Math.round(vp.get(r.buyer_id)), best: r.best }))
  .sort((a, b) => b.to - a.to);

console.log(`VP_SCALE=${VP_SCALE} VP_K=${VP_K} · ${rows.length} bouts replayed · ${changes.length} members\n`);
console.log("     member                 from      to");
changes.forEach((c, i) => console.log(String(i + 1).padStart(4), String(c.name).padEnd(22), String(c.from).padStart(6), String(c.to).padStart(7)));
const untouched = live.filter((r) => !vp.has(r.buyer_id));
console.log(`\n${untouched.length} members have never fought a person — left exactly as they are, and already off the ladder.`);

if (!APPLY) { console.log("\ndry run — pass --apply to write"); process.exit(0); }

const roll = changes.map((c) => `UPDATE mkt_arena SET vp = ${c.from}, best_vp = ${c.best} WHERE buyer_id = '${c.id}';`).join("\n");
const path = `scripts/_vp-rollback-${rows.length}.sql`;
writeFileSync(path, roll + "\n");
console.log(`rollback written to ${path}`);

for (const c of changes) {
  // best_vp is the highest anyone has ever STOOD, and a figure on the old scale is not comparable to one on
  // the new one — left alone it would sit permanently above a rating that can never reach it again, which is
  // a broken promise rather than a trophy. Rebuilt to the true high-water of the replay, so it still means
  // what the Trophy Room says it means.
  await db.query(`UPDATE mkt_arena SET vp = $2, best_vp = $3, updated_at = NOW() WHERE buyer_id = $1`,
    [c.id, c.to, c.bestTo]).catch((e) => console.error("failed", c.name, e?.message));
}
console.log(`\napplied to ${changes.length} members.`);
