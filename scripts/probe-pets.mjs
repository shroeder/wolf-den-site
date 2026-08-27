import { db } from "../src/lib/db.js";
const seen = new Map(); let n = 0;
for (const k of ["query", "queryOne"]) { const real = db[k].bind(db); db[k] = (sql, ...r) => { n += 1;
  const key = String(sql).replace(/\s+/g, " ").trim().slice(0, 78); seen.set(key, (seen.get(key)||0)+1); return real(sql, ...r); }; }
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const P = await import("../src/lib/marketplace/pets.js");
seen.clear(); n = 0;
const t = Date.now();
const st = await P.petsState(who.id, { sync: true });
const ms = Date.now() - t;
console.log();
console.log(`  petsState(sync): ${n} round trips in ${ms}ms`);
console.log(`  PetAlerts uses only: petLevels (${Object.keys(st?.petLevels || {}).length} entries) + signedIn`);
console.log(`  payload size: ${JSON.stringify(st).length} bytes`);
console.log();
for (const [q, c] of [...seen.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12)) console.log(`  x${String(c).padStart(3)}  ${q}`);
console.log();