// Give every already-enhanced item the base-damage and armour it would have earned.
//
// Enhancing used to move a piece's AFFIXES and nothing else — a +12 sword swung for exactly what a +0 sword
// swung for, because base damage was not a thing the forge could touch. It is now: 3-5% of a weapon's base
// damage per level, 5-8% of a piece of armour's base armour. Everyone who forged before that shipped is
// holding levels that bought them none of it.
//
// THE MIDPOINT, NOT A ROLL. A live enhance rolls inside its band; this pays 4% a level for weapons and 6.5%
// for armour. Re-rolling history would hand two people with identical +10 swords different swords, and the
// difference would be luck they never had a chance at.
//
// Only pieces that can carry it: weapons take base_damage, the six armour slots take armor, and rings and
// amulets take neither because they have neither.
//
// The added amounts are written to mkt_activity_event first, so this is reversible. Idempotent by a marker
// row. --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

import { itemById } from "../src/lib/marketplace/items.js";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const ARMOUR_SLOTS = new Set(["helmet", "chest", "belt", "boots", "back", "off_hand"]);
const WEAPON_RATE = 0.04;   // midpoint of 3-5%
const ARMOUR_RATE = 0.065;  // midpoint of 5-8%

const done = await sql`SELECT 1 FROM mkt_activity_event WHERE event = 'enhance_base_backfill' LIMIT 1`;
if (done.length && APPLY) { console.log("already run — marker present."); process.exit(0); }

const rows = await sql`
    SELECT e.buyer_id, e.item_id, e.level, e.stat_bonus, b.display_name
      FROM mkt_item_enhance e JOIN mkt_buyer b ON b.id = e.buyer_id
     WHERE e.level > 0`;

const changes = [];
let addedDamage = 0, addedArmour = 0;
for (const r of rows) {
    const it = itemById(r.item_id);
    if (!it) continue;
    const key = it.slot === "main_hand" ? "base_damage" : (ARMOUR_SLOTS.has(it.slot) ? "armor" : null);
    if (!key) continue;
    const base = Number(it.stats?.[key]) || 0;
    if (!base) continue;
    const rate = key === "base_damage" ? WEAPON_RATE : ARMOUR_RATE;
    const gain = Math.max(1, Math.round(base * rate * Number(r.level)));
    const bonus = typeof r.stat_bonus === "string" ? JSON.parse(r.stat_bonus || "{}") : (r.stat_bonus || {});
    // Anything already there is left alone — this only pays what is missing.
    if (Number(bonus[key])) continue;
    bonus[key] = gain;
    changes.push({ buyer: r.buyer_id, name: r.display_name, item: r.item_id, itemName: it.name,
        level: r.level, key, gain, bonus });
    if (key === "base_damage") addedDamage += gain; else addedArmour += gain;
}

const byMember = {};
for (const c of changes) byMember[c.name] = (byMember[c.name] || 0) + 1;
console.log(`${changes.length} enhanced pieces across ${Object.keys(byMember).length} members`);
console.log(`  +${addedDamage} base damage and +${addedArmour} armour in total\n`);
for (const c of changes.slice(0, 14)) {
    console.log(`  ${(c.name || "?").padEnd(18)} ${c.itemName.padEnd(24)} +${c.level}  ->  +${c.gain} ${c.key}`);
}
if (changes.length > 14) console.log(`  ... and ${changes.length - 14} more`);

if (!APPLY) { console.log("\ndry run — pass --apply to write"); process.exit(0); }

await sql`
    INSERT INTO mkt_activity_event (buyer_id, event, meta)
    VALUES (NULL, 'enhance_base_backfill', ${JSON.stringify({ pieces: changes.length, addedDamage, addedArmour,
        rates: { weapon: WEAPON_RATE, armour: ARMOUR_RATE },
        changes: changes.map((c) => ({ b: c.buyer, i: c.item, k: c.key, g: c.gain })) })}::jsonb)`;

for (const c of changes) {
    await sql`UPDATE mkt_item_enhance SET stat_bonus = ${JSON.stringify(c.bonus)}::jsonb, updated_at = NOW()
               WHERE buyer_id = ${c.buyer} AND item_id = ${c.item}`;
}
console.log(`\napplied — ${changes.length} pieces updated.`);
