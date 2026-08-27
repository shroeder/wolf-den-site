import { db } from "../src/lib/db.js";
let n = 0;
for (const k of ["query","queryOne"]) { const real = db[k].bind(db); db[k] = (...a) => { n += 1; return real(...a); }; }
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const P = await import("../src/lib/marketplace/pets.js");
const run = async (label, fn) => { n = 0; const t = Date.now(); const v = await fn().catch(() => null); console.log(`  ${label.padEnd(34)} ${String(n).padStart(3)} round trips  ${String(Date.now()-t).padStart(5)}ms`); return v; };
console.log();
await run("petsState({ sync: true })", () => P.petsState(who.id, { sync: true }));
await run("petsState({ sync: false })", () => P.petsState(who.id, { sync: false }));
await run("syncPetAchievements alone", () => P.syncPetAchievements(who.id));
console.log();