// ── DOES A BLOW GET THROUGH? ─────────────────────────────────────────────────────────────────────────────────
// Mitigation is FLAT: `blow = max(1, raw - armour)`. What matters is therefore not the RATIO of damage to
// armour but the DIFFERENCE, and a difference can go to nothing — at which point the floor of 1 takes over, a
// bout becomes a race between two health bars at one point a swing, and the fight lasts a quarter of an hour.
//
// This is invisible to every test that came before it. A mirror match scales both sides together. A tuned dummy
// is tuned until it isn't floored. Only a FIELD — everyone against everyone — can show it, and only real
// members can show whether it is happening in the live game rather than in a script's idea of a loadout.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-armour-wall.mjs
import { db } from "../src/lib/db.js";

const { kitFor } = await import("../src/lib/marketplace/arena.js");

const rows = await db.query(`
    SELECT DISTINCT b.id, b.display_name
      FROM mkt_buyer b JOIN mkt_user_equipment e ON e.buyer_id = b.id
     WHERE e.item_id IS NOT NULL AND b.display_name IS NOT NULL`);

const fighters = [];
for (const r of rows) {
    const k = await kitFor(r.id).catch(() => null);
    if (!k || !k.health) continue;
    fighters.push({ who: r.display_name, dmg: Math.round(k.damage), hp: k.health, armor: k.armor,
        spd: Number(k.speed.toFixed(2)), pierce: Number(k.pierce) || 0 });
}
fighters.sort((a, z) => z.dmg - a.dmg);

console.log(`\n${fighters.length} members with gear on\n`);
console.log("  member               damage   armour   health    vs the field: a typical blow");
for (const f of fighters) {
    // What this member's swing does to everyone else, armour and their own pierce accounted for.
    const blows = fighters.filter((o) => o !== f)
        .map((o) => Math.max(1, Math.round(f.dmg - o.armor * (1 - Math.min(1, f.pierce * 0.005)))));
    const med = blows.sort((a, b) => a - b)[Math.floor(blows.length / 2)];
    const floored = blows.filter((b) => b <= 1).length;
    console.log(`  ${f.who.slice(0, 18).padEnd(20)} ${String(f.dmg).padStart(6)} ${String(f.armor).padStart(8)} ${String(f.hp).padStart(8)}    ${String(med).padStart(5)}   ${floored}/${blows.length} floored`);
}

let floored = 0;
let pairs = 0;
let swingsToKill = [];
for (const a of fighters) {
    for (const b of fighters) {
        if (a === b) continue;
        pairs += 1;
        const blow = Math.max(1, Math.round(a.dmg - b.armor * (1 - Math.min(1, a.pierce * 0.005))));
        if (blow <= 1) floored += 1;
        swingsToKill.push(b.hp / blow);
    }
}
swingsToKill.sort((x, y) => x - y);
const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`\n  ${floored} of ${pairs} matchups (${pct(floored, pairs)}) land the FLOOR of 1 damage a swing`);
console.log(`  median swings to kill: ${Math.round(swingsToKill[Math.floor(swingsToKill.length / 2)])}`);
console.log(`  worst case: ${Math.round(swingsToKill[swingsToKill.length - 1])} swings\n`);
process.exit(0);
