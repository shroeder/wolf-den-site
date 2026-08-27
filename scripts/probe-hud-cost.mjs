// Counts database round trips for what GameNav asks for, the old way against the new way. Real member, prod data.
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/probe-hud-cost.mjs
import { db } from "../src/lib/db.js";

let n = 0;
for (const k of ["query", "queryOne"]) {
    const real = db[k].bind(db);
    db[k] = (...a) => { n += 1; return real(...a); };
}
const count = async (label, fn) => {
    n = 0;
    const t = Date.now();
    await fn().catch(() => {});
    console.log(`  ${label.padEnd(34)} ${String(n).padStart(4)} round trips   ${Date.now() - t}ms`);
    return n;
};

const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const id = who.id;

const { getArenaState, arenaNav } = await import("../src/lib/marketplace/arena.js");
const { getJewellerState } = await import("../src/lib/marketplace/jeweller.js");
const { getCasinoState } = await import("../src/lib/marketplace/casino.js");
const { getKitchenState } = await import("../src/lib/marketplace/cooking.js");

console.log();
console.log("  -- WHAT THE MENU USED TO COST --  (four of the fourteen; each read for ONE boolean)");
console.log();
let before = 0;
before += await count("arena     (unlocked, fightsLeft)", () => getArenaState(id));
before += await count("jeweller  (unlocked)", () => getJewellerState(id));
before += await count("casino    (open)", () => getCasinoState(id));
before += await count("cooking   (unlocked)", () => getKitchenState(id));

console.log();
console.log("  -- WHAT IT COSTS NOW --");
console.log();
let after = 0;
after += await count("arenaNav  (same two numbers)", () => arenaNav(id));
console.log(`  ${"jeweller/casino/cooking".padEnd(34)}    0 round trips   (Boolean(buyerId) / isOwner)`);

console.log();
console.log(`  These four: ${before} round trips -> ${after}.  And the menu is 14 invocations -> 1.`);
console.log();