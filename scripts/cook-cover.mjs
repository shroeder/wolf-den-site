// Can the belt's ability actually be reached now?
//   ValkyrieSylve: "My ascendant belt says i can substitute one ingredient i dont have for one i do have,
//   however, theres is no way for me to use the ability when cooking."
// She was right: the cook button is disabled unless `canCook`, and `canCook` demanded a full pantry — the
// one state that fires the power was the one state the button refused to enter. This runs the REAL kitchen
// state builder and lists what the card will now offer her.
//   node --import ./scripts/lib/register-loader.mjs scripts/cook-cover.mjs [displayName]
import fs from "node:fs";
process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8")
        .match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^"|"$/g, "");

const { db } = await import("@/lib/db");
const { getKitchenState } = await import("@/lib/marketplace/cooking.js");
const { equippedPowers } = await import("@/lib/marketplace/ascension-powers.js");
const { primeEquip } = await import("@/lib/marketplace/equip-cache.js");

const NAME = process.argv[2] || "ValkyrieSylve";
const who = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [NAME]);
if (!who) { console.log(`no member called ${NAME}`); process.exit(1); }
// ⚠️ `--as-if-worn` PRIMES THE MEMO, IT DOES NOT TOUCH HER ACCOUNT. She owns the belt and is not wearing
// it, which is half of why nothing showed up — but the reachability bug has to be provable without
// equipping gear on somebody's live character. primeEquip fills the same in-request cache equippedPowers
// reads, so cook() and the board see the power exactly as they would if it were on.
if (process.argv.includes("--as-if-worn")) {
    primeEquip("powers", String(who.id), new Set(["substitution"]));
    console.log("(priming: pretending the Risen Binding is worn — nothing written)");
}
const powers = await equippedPowers(who.id);
console.log(`${who.display_name} — cook powers worn: ${[...powers].filter((p) => ["substitution", "standing_recipe"].includes(p)).join(", ") || "NONE"}`);

const st = await getKitchenState(who.id);
const recipes = st.recipes || [];
const covered = recipes.filter((r) => r.cover);
console.log(`${recipes.length} recipes · ${recipes.filter((r) => r.canCook).length} ready · ${covered.length} now COVERED by a power`);
for (const r of covered.slice(0, 12)) {
    console.log(`  ${r.name.padEnd(26)} ${r.cover.name} covers ${r.cover.lines.join(", ")} (${r.cover.uses} left)`);
}
if (!covered.length) console.log("  (nothing short is coverable right now — either the pantry has no spare stock or the day's uses are spent)");
