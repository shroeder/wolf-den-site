import { db } from "../src/lib/db.js";
let n = 0;
for (const k of ["query","queryOne"]) { const real = db[k].bind(db); db[k] = (...a) => { n += 1; return real(...a); }; }
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const P = await import("../src/lib/marketplace/pets.js");
const run = async (label, fn) => { n = 0; const t = Date.now(); const v = await fn().catch((e) => { console.log("ERR", e.message); return null; });
  console.log(`  ${label.padEnd(38)} ${String(n).padStart(3)} round trips  ${String(Date.now()-t).padStart(5)}ms  ${v ? JSON.stringify(v).length : 0} bytes`); return v; };
console.log();
await run("OLD: petsState({ sync: true })", () => P.petsState(who.id, { sync: true }));
const a = await run("NEW: petsPeek (first, sweeps)", () => P.petsPeek(who.id));
await run("NEW: petsPeek (again, inside window)", () => P.petsPeek(who.id));
await run("NEW: petsPeek (third)", () => P.petsPeek(who.id));
console.log();
console.log(`  fields returned: ${Object.keys(a || {}).join(", ")}`);
console.log(`  petLevels entries: ${Object.keys(a?.petLevels || {}).length}, ownedIds: ${(a?.ownedIds || []).length}`);
console.log();