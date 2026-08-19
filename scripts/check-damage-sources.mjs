// ── WHERE DOES A SWING ACTUALLY COME FROM? ───────────────────────────────────────────────────────────────────
// Damage is `base_damage x might / 5` — two levers, multiplied. So a fighter who is twice as strong is not
// twice as invested: they may have twice the might, or a weapon with twice the base, or a bit of both, and the
// three read completely differently on a balance sheet. The sim can say JT hits for 1285 and the field for 600;
// only a decomposition can say WHY, and that is the number a tuning decision is actually made against.
//
// Might arrives from six places and every one of them is a different lever with a different cure:
//   catalogue     the base line on the items they are wearing
//   set bonuses   matching pieces
//   forge         enhancement levels
//   gems          socketed jewels
//   pets+badges   what they earned outside the shop
//   the tree      their ten points
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-damage-sources.mjs [name] [name...]
import { sumItemStats, itemById } from "../src/lib/marketplace/items.js";
import { getEquippedStats, getEquippedIds } from "../src/lib/marketplace/inventory.js";
import { combatStats } from "../src/lib/marketplace/arena.js";
import { db } from "../src/lib/db.js";

const WANTED = process.argv.slice(2);

const rows = WANTED.length
    ? await db.query(`SELECT id, display_name FROM mkt_buyer WHERE display_name = ANY($1)`, [WANTED])
    : await db.query(`
        SELECT DISTINCT b.id, b.display_name
          FROM mkt_buyer b
          JOIN mkt_activity_event e ON e.buyer_id = b.id
          JOIN mkt_user_equipment q ON q.buyer_id = b.id
         WHERE e.created_at > NOW() - INTERVAL '14 days' AND b.display_name IS NOT NULL AND q.item_id IS NOT NULL
         GROUP BY b.id, b.display_name
        HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) >= 12`);

const out = [];
for (const r of rows) {
    const bySlot = await getEquippedIds(r.id).catch(() => ({}));
    const ids = Object.values(bySlot || {}).filter(Boolean);
    if (!ids.length) continue;
    const catalogue = sumItemStats(ids);                                   // the printed line on each piece
    const wardrobe = await getEquippedStats(r.id).catch(() => ({}));       // + sets, forge, gems
    const outside = await combatStats(r.id, {}, []).catch(() => ({}));     // pets, badges, compendium
    const full = await combatStats(r.id, wardrobe, ids).catch(() => ({}));

    const weaponId = bySlot.main_hand;
    const weapon = weaponId ? itemById(weaponId) : null;
    out.push({
        who: r.display_name,
        weapon: weapon?.name || "bare hands",
        weaponBase: Math.round(Number(catalogue.base_damage) || 0),
        // What the forge/gems added to the weapon's own base, on top of the catalogue line.
        weaponForged: Math.round((Number(wardrobe.base_damage) || 0) - (Number(catalogue.base_damage) || 0)),
        base: Math.round(Number(wardrobe.base_damage) || 0),
        mightCatalogue: Math.round(Number(catalogue.might) || 0),
        mightWardrobe: Math.round((Number(wardrobe.might) || 0) - (Number(catalogue.might) || 0)),
        mightOutside: Math.round(Number(outside.might) || 0),
        might: Math.round(Number(full.might) || 0),
        damage: Math.round(((Number(wardrobe.base_damage) || 0) * (Number(full.might) || 0)) / 5),
        slots: ids.length,
    });
}
out.sort((a, z) => z.damage - a.damage);

console.log("\n  member               damage  =  weapon base  x  might  / 5");
console.log("                                  (catalogue+forged)   (catalogue + sets/forge/gems + outside)\n");
for (const m of out) {
    console.log(`  ${m.who.slice(0, 18).padEnd(20)} ${String(m.damage).padStart(6)}     ${String(m.base).padStart(3)} (${m.weaponBase}+${m.weaponForged})   ${String(m.might).padStart(4)} (${m.mightCatalogue}+${m.mightWardrobe}+${m.mightOutside})   ${m.slots} worn   ${m.weapon}`);
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const top = out.slice(0, 2);
const rest = out.slice(2);
console.log(`\n  top two:  base ${avg(top.map((m) => m.base)).toFixed(0)}   might ${avg(top.map((m) => m.might)).toFixed(0)}   damage ${avg(top.map((m) => m.damage)).toFixed(0)}`);
console.log(`  the rest: base ${avg(rest.map((m) => m.base)).toFixed(0)}   might ${avg(rest.map((m) => m.might)).toFixed(0)}   damage ${avg(rest.map((m) => m.damage)).toFixed(0)}`);
console.log(`  so the gap is ${(avg(top.map((m) => m.base)) / avg(rest.map((m) => m.base))).toFixed(2)}x on the weapon and ${(avg(top.map((m) => m.might)) / avg(rest.map((m) => m.might))).toFixed(2)}x on might — multiplied, ${(avg(top.map((m) => m.damage)) / avg(rest.map((m) => m.damage))).toFixed(2)}x the swing\n`);
process.exit(0);
