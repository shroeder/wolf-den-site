import { db } from "../src/lib/db.js";
const seen = new Map();
for (const k of ["query", "queryOne"]) {
    const real = db[k].bind(db);
    db[k] = (sql, ...rest) => {
        const key = String(sql).replace(/\s+/g, " ").trim().slice(0, 92);
        seen.set(key, (seen.get(key) || 0) + 1);
        return real(sql, ...rest);
    };
}
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const { getArenaState } = await import("../src/lib/marketplace/arena.js");
seen.clear();
const t = Date.now();
await getArenaState(who.id);
const ms = Date.now() - t;
const rows = [...seen.entries()].sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, r) => s + r[1], 0);
console.log();
console.log(`  getArenaState: ${total} round trips in ${ms}ms`);
console.log();
for (const [q, n] of rows) console.log(`  x${String(n).padStart(3)}  ${q}`);
console.log();