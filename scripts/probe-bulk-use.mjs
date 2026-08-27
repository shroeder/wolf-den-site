import { db } from "../src/lib/db.js";
const C = await import("../src/lib/marketplace/consumables.js");
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const rows = await db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0 ORDER BY count DESC`, [who.id]);
console.log();
console.log("  WHAT THE OWNER HOLDS, AND WHETHER Use all APPEARS");
console.log();
let bulk = 0, single = 0;
for (const r of rows) {
  const can = C.canBulkUse(r.consumable_id);
  if (can && r.count > 1) bulk += 1; else single += 1;
  const mark = can ? (r.count > 1 ? "ALL " + r.count : "bulkable, only 1") : "one at a time";
  console.log(`  ${String(r.consumable_id).padEnd(26)} x${String(r.count).padStart(3)}   ${mark}`);
}
console.log();
console.log(`  ${bulk} would show a Use all button, ${single} would not.`);
console.log(`  cap per request: ${C.BULK_USE_CAP}`);
console.log();