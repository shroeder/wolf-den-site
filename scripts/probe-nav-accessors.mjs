import { db } from "../src/lib/db.js";
let n = 0;
for (const k of ["query","queryOne"]) { const real = db[k].bind(db); db[k] = (...a) => { n += 1; return real(...a); }; }
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const id = who.id;
const F = await import("../src/lib/marketplace/farm.js");
const M = await import("../src/lib/marketplace/mining.js");
const run = async (label, fn) => { n = 0; const t = Date.now(); const v = await fn().catch((e) => { console.log("  ERR", e.message); return null; });
  console.log(`  ${label.padEnd(32)} ${String(n).padStart(3)} round trips  ${String(Date.now()-t).padStart(5)}ms   ${JSON.stringify(v)}`); return v; };
console.log();
await run("OLD getFarm", () => F.getFarm(id, id).then((x) => ({ cropsReady: x?.garden?.readyCount, petNudge: x?.petNudge })));
await run("NEW farmNav", () => F.farmNav(id));
await run("OLD getMiningState", () => M.getMiningState(id).then((x) => ({ trips: x?.trips?.left, partsReady: x?.partsReady })));
await run("NEW miningNav", () => M.miningNav(id));
console.log();