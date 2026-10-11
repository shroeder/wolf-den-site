// ── DID THAT ENSHRINEMENT ACTUALLY MOVE ANYTHING FOR THIS PERSON? ────────────────────────────────────────────
// GrayKitsune: "I just enshrined my lion with a darkstone and saw no stat changes or increase in damage on
// boss page."
//
// pet-stone-check.mjs says the Lion Cub's stones are both live against a fresh kit, so the question is not
// whether the stone works in general — it is whether it worked in HIS collection, where other pets may
// already supply the same ability and the cap may already be reached. Only his real rows answer that.
//
// ⚠️ IT MIRRORS getPetCombatBonus EXACTLY, because a harness that assembles the inputs its own way measures
// its own assembly. Two wrong versions of this file already lied: one read a "level" column that does not
// exist (level is derived from xp AND rarity) and reported level 1 for everything, and one read owned pets
// out of mkt_pet_redemption — which is redemptions, not ownership — and found nobody owning anything while
// they had twenty-one pets enshrined.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/why-no-change.mjs <displayName> <petId>
import fs from "node:fs";

import { neon } from "@neondatabase/serverless";

import { COLLECTIBLES, collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { combinePetBonuses, PET_PERKS } from "@/lib/marketplace/pet-perks.js";
import { ASCENSION_EFFECTS } from "@/lib/marketplace/pet-ascension-effects.js";
import { levelsFromXpMap } from "@/lib/marketplace/pet-level.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

const NAME = process.argv[2] || "GrayKitsune";
const PET = process.argv[3] || "lion_cub";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^"|"$/g, ""));

const [who] = await sql`SELECT id, display_name, COALESCE(xp, 0) AS xp, featured_collectible
                          FROM mkt_buyer WHERE display_name = ${NAME} LIMIT 1`;
if (!who) { console.log(`no member called ${NAME}`); process.exit(1); }

const unlocks = await sql`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = ${who.id} AND category = 'pet'`;
const xpRows = await sql`SELECT pet_id, xp FROM mkt_pet_level WHERE buyer_id = ${who.id}`;
const ens = await sql`SELECT pet_id, stone FROM mkt_pet_enshrined WHERE buyer_id = ${who.id}`;

const level = levelForXp(Number(who.xp) || 0).level;
const granted = new Set(unlocks.map((r) => r.ref));
const owned = COLLECTIBLES.filter((p) => isCollectibleUnlocked(p, level, { owned: granted }));
const equipped = who.featured_collectible ? collectibleById(who.featured_collectible) : null;
const petXp = Object.fromEntries(xpRows.map((r) => [r.pet_id, Number(r.xp) || 0]));
const levels = levelsFromXpMap(petXp);
// ⚠️ AND IT HAS TO CARRY THE PET OBJECT, exactly as getEnshrined hydrates it. combinePetBonuses reads
// e.pet and skips any entry without one — so a harness passing { petId, stone } applies NO enshrinement
// on either side of the comparison and reports "nothing moved" for every pet in the game. That is the
// third way this file lied before it told the truth.
const enshrined = ens.map((e) => ({ petId: e.pet_id, stone: e.stone, pet: collectibleById(e.pet_id) }))
    .filter((e) => e.pet);

console.log(`${who.display_name}: member level ${level}, ${owned.length} pets owned, ${enshrined.length} enshrined`);
const eff = ASCENSION_EFFECTS?.[PET];
const mine = enshrined.find((e) => e.petId === PET);
console.log(`${PET}: enshrined ${mine ? "with the " + mine.stone + "stone" : "NOT by this member"}`);
console.log(`   light ${JSON.stringify(eff?.light)}`);
console.log(`   dark  ${JSON.stringify(eff?.dark)}\n`);

const withIt = combinePetBonuses(owned, equipped, levels, enshrined, null, null);
// ⚠️ COMPARE THE TWO STONES, NOT PRESENT-VS-ABSENT. Removing the pet removes its own ability too, so that
// comparison measures the ENSHRINEMENT and credits the stone with it. The decision the member actually made
// was dark instead of light, and only swapping the stone isolates what that bought.
const other = mine?.stone === "dark" ? "light" : "dark";
const without = combinePetBonuses(owned, equipped, levels,
    enshrined.map((e) => (e.petId === PET ? { ...e, stone: other } : e)), null, null);
console.log(`comparing: ${PET} with the ${mine?.stone}stone  vs  the ${other}stone
`);

// ⚠️ THE BONUS IS NESTED — { stats, economy, proc, system }. A flat diff over the top level compares four
// objects with === and reports "everything changed" as NaN, which is how the first run of this looked like
// an answer.
let moved = 0;
for (const group of [...new Set([...Object.keys(withIt || {}), ...Object.keys(without || {})])].sort()) {
    const a = without?.[group] || {};
    const b = withIt?.[group] || {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const rows = keys.filter((k) => Number(a[k] ?? 0) !== Number(b[k] ?? 0));
    if (!rows.length) continue;
    console.log(`${group}:`);
    for (const k of rows) {
        const x = Number(a[k] ?? 0);
        const y = Number(b[k] ?? 0);
        moved += 1;
        console.log(`   ${k.padEnd(24)} ${String(x).padStart(8)} -> ${String(y).padStart(8)}   ${(y - x > 0 ? "+" : "")}${(y - x).toFixed(2)}`);
    }
}
// What the ability in question actually sits at, and what else is feeding it — because "no change"
// from a cap and "no change" from a broken graft look identical from the outside.
const key = eff?.dark?.key || eff?.light?.key;
if (key) {
    for (const g of ["stats", "economy", "proc", "system"]) {
        if (withIt?.[g] && key in withIt[g]) console.log(`
${key} sits at ${withIt[g][key]} (${g})`);
    }
    // ⚠️ THE PET'S OWN ABILITY COUNTS TOO, not just the stone's key. An amplify has no .key — it boosts
    // whatever the pet already does — so comparing stone keys alone reports "none" while two other pets are
    // supplying the very ability in question.
    const ownKey = (id) => (PET_PERKS[id] || {}).key || COLLECTIBLES.find((c) => c.id === id)?.activeStat;
    const feeding = enshrined.filter((e) => e.petId !== PET).filter((e) => ownKey(e.petId) === key);
    console.log(`enshrined pets whose OWN ability is "${key}": ${feeding.length ? feeding.map((o) => o.petId).join(", ") : "none"}`);
    const others = enshrined.filter((e) => e.petId !== PET)
        .filter((e) => { const x = ASCENSION_EFFECTS?.[e.petId]?.[e.stone]; return x && x.key === key; });
    console.log(`other enshrined pets feeding "${key}": ${others.length ? others.map((o) => o.petId + "/" + o.stone).join(", ") : "none"}`);
}
console.log(moved
    ? `\n${moved} number(s) moved — the stone is doing something for this member.`
    : `\nNOTHING MOVED. For this member, enshrining ${PET} changed no number in the game.`);
