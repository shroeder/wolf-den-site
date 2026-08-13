// What a Guard is now worth, per class and per real member. Reads the SAME functions the ring uses.
// Usage: node --import ./scripts/lib/register-loader.mjs scripts/guard-check.mjs
import { readFileSync } from "node:fs";
process.env.DATABASE_URL ||= readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const realLog = console.log;
console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith('{"timestamp"')) return; realLog(...a); };

const { db } = await import("@/lib/db");
const { guardSoakFrom } = await import("@/lib/marketplace/arena-kit.js");
const { classBase, CLASSES } = await import("@/lib/marketplace/arena-classes.js");
const { healthFrom, SHIELD_CAP } = await import("@/lib/marketplace/arena-kit.js");
const { getEquippedStatsForMembers } = await import("@/lib/marketplace/inventory.js");

console.log("\n── Guard as a share of max health, by class and Fortune ──");
console.log(`   Fortune:      ${[0, 20, 40, 60, 80, 100].map((f) => String(f).padStart(6)).join("")}`);
for (const c of CLASSES) {
    const row = [0, 20, 40, 60, 80, 100]
        .map((f) => `${Math.round(guardSoakFrom(c.guard, f) * 1000) / 10}%`.padStart(6)).join("");
    console.log(`   ${c.name.padEnd(12)}${row}`);
}
console.log(`   ${"+ maxed Fortress".padEnd(12)}${[0, 20, 40, 60, 80, 100]
    .map((f) => `${Math.round(guardSoakFrom(0.24, f, 0.15) * 1000) / 10}%`.padStart(6)).join("")}   (Warden)`);
console.log(`\n   Shield cap is ${Math.round(SHIELD_CAP * 100)}% of max health (+6%/rank Unyielding).\n`);

// Real members who have picked a class — what one Guard actually banks for them.
const rows = await db.query(
    `SELECT b.id, COALESCE(NULLIF(b.display_name,''), b.alias) AS who, a.arena_class
       FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
      WHERE a.arena_class IS NOT NULL`
);
const gear = await getEquippedStatsForMembers(rows.map((r) => r.id));
console.log("── One Guard, for the members who have picked a class ──");
const out = rows.map((r) => {
    const g = gear.get(r.id) || {};
    const base = classBase(r.arena_class);
    const share = guardSoakFrom(base.guard, g.fortune || 0);
    const hp = Math.round(healthFrom(g.ferocity || 0) + base.health);
    return { who: r.who, cls: r.arena_class, fortune: Math.round(g.fortune || 0), hp, share, brace: Math.round(hp * share) };
}).sort((a, b) => b.brace - a.brace);
const w = Math.max(...out.map((r) => r.who.length));
for (const r of out) {
    console.log(`   ${r.who.padEnd(w)}  ${r.cls.padEnd(11)} fortune ${String(r.fortune).padStart(3)}  `
        + `hp ${String(r.hp).padStart(4)}  →  brace ${String(r.brace).padStart(4)}  (${Math.round(r.share * 1000) / 10}%)`);
}
console.log();
process.exit(0);
