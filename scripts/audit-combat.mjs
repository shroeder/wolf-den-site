// ── DOES EVERY COMBAT STAT ACTUALLY DO SOMETHING? ────────────────────────────────────────────────────────────
// check-passives.mjs asks the question for the thirty-six tree nodes. This asks it for the ENGINE ITSELF: every
// field autoBout reads, one at a time, against a controlled fighter in a fight long enough for it to matter.
//
// Two halves again:
//
//   ENGINE   a baseline fighter is built so a bout runs about twenty swings — long enough for a stun, a
//            bleed, a guard or a regen to happen. Each field is then raised on its own and the fight re-run
//            with a fixed seed. A field that changes nothing is read by nothing.
//
//   SOURCES  for a real member, where each stat actually comes from — gear, pets, badges, the tree. A stat
//            the engine reads but no source can grant is a stat nobody will ever have.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/audit-combat.mjs [member]
import { autoBout } from "../src/lib/marketplace/arena-engine.js";
import { getEquippedStats } from "../src/lib/marketplace/inventory.js";
import { CLASSES, treeFor, treeEffects } from "../src/lib/marketplace/arena-classes.js";
import { db } from "../src/lib/db.js";

const WHO = process.argv[2] || "The Wolf Den";
const { kitFor } = await import("../src/lib/marketplace/arena.js");

const seeded = (n) => () => { n = (n * 1664525 + 1013904223) % 4294967296; return n / 4294967296; };

// A pair that trade evenly for about twenty swings, with armour low enough that blows get through it.
// Armour is a real fraction of the blow, because PIERCE cannot show against armour that was not stopping
// anything — at armour 10 against a 100 blow, going round it and going through it come to the same number.
// And a small standing block chance, because blockReduction, thorns and the block stacks all need a block to
// have happened before they can do anything at all.
const DUMMY = { damage: 100, health: 2000, armor: 40, speed: 1, critChance: 0.1, critMult: 1.5,
    pierce: 0, counter: 0, doublestrike: 0, lifesteal: 0, blockChance: 0.25, blockReduction: 0.35 };

const play = (me) => {
    let s = "";
    for (let i = 1; i <= 20; i += 1) {
        const r = autoBout({ ...me }, { ...DUMMY }, { rng: seeded(i * 104729) });
        s += `${r.won ? 1 : 0}:${r.swings}:${Math.round(r.hp)}:${Math.round(r.foeHp)}|`;
    }
    return s;
};
const BASE = play(DUMMY);

// Every field side() pulls off a fighter, with a value big enough to be unmistakable.
const FIELDS = [
    ["damage", 200], ["health", 4000], ["armor", 60], ["speed", 2], ["dmgPct", 0.5],
    ["critChance", 0.9], ["critMult", 3], ["pierce", 100], ["counter", 200], ["doublestrike", 150],
    ["lifesteal", 200], ["stun", 100], ["haste", 100], ["blockChance", 0.5], ["blockReduction", 0.9],
    ["counterBonus", 0.5], ["doublestrikeBonus", 0.5], ["lifestealBonus", 0.5], ["stunBonus", 0.5],
    ["hasteBonus", 0.5],
    ["bleedChance", 0.9], ["bleedDamage", 0.5], ["bleedLeech", 0.5], ["wildProc", 0.5],
    ["guardChance", 0.9], ["guardSize", 0.3], ["regen", 0.05], ["thorns", 0.5], ["grudge", 0.5],
    ["burnChance", 0.9], ["burnDamage", 0.5], ["burnLeech", 0.5], ["freeze", 0.5], ["chill", 0.5],
    ["iceThorns", 0.5], ["ward", 0.5], ["wardRefill", 0.05], ["surge", 1], ["soulfire", 0.5],
    ["cataclysm", 0.5], ["blockStack", 0.05], ["blockStackMax", 5],
];

console.log("── ENGINE ──────────────────────────────────────────────────────");
const dead = [];
for (const [field, value] of FIELDS) {
    // guardSize and wardRefill only mean anything alongside the thing they modify.
    const extra = field === "guardSize" ? { guardChance: 0.9 }
        : field === "wardRefill" ? { ward: 0.3 }
        : field === "blockStack" ? { blockStackMax: 5 }
        : field === "blockStackMax" ? { blockStack: 0.05 }
        : field === "bleedDamage" || field === "bleedLeech" ? { bleedChance: 0.9 }
        : field === "burnDamage" || field === "burnLeech" ? { burnChance: 0.9 }
        : {};
    const against = Object.keys(extra).length ? play({ ...DUMMY, ...extra }) : BASE;
    const got = play({ ...DUMMY, ...extra, [field]: value });
    const ok = got !== against;
    if (!ok) dead.push(field);
    console.log(`  ${ok ? "ok  " : "DEAD"} ${field}`);
}

console.log("\n── SOURCES ─────────────────────────────────────────────────────");
const who = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
const gear = await getEquippedStats(who.id).catch(() => ({}));
let pet = {}, badge = {};
try { pet = (await (await import("../src/lib/marketplace/pet-combat.js")).getPetCombatBonus(who.id))?.stats || {}; } catch { /* */ }
try { badge = await (await import("../src/lib/marketplace/badges.js")).getBadgePassives(who.id); } catch { /* */ }
const treeKeys = new Set();
for (const c of CLASSES) for (const n of treeFor(c.id)) treeKeys.add(n.stat);

const STATS = ["might", "vitality", "ferocity", "tenacity", "crit_chance", "crit_power", "pierce",
    "lifesteal", "counter", "stun", "haste", "doublestrike", "block_chance", "armor", "base_damage", "speed"];
console.log("  stat            gear    pets  badges   tree");
for (const s of STATS) {
    const inTree = [...treeKeys].some((k) => k.toLowerCase().replace(/[^a-z]/g, "").includes(s.replace(/_/g, "")));
    const fmt = (v) => { const n = Number(v) || 0; return (n && n < 10 ? n.toFixed(2) : String(Math.round(n))); };
    console.log(`  ${s.padEnd(15)}${fmt(gear[s]).padStart(5)}${fmt(pet[s]).padStart(8)}${fmt(badge[s]).padStart(8)}${(inTree ? "   yes" : "    no").padStart(7)}`);
}

const kit = await kitFor(who.id, { skillTree: {} });
console.log(`\n  ${who.display_name}: damage ${Math.round(kit.damage)}  health ${kit.health}  armour ${kit.armor}  speed ${kit.speed.toFixed(2)}`);
console.log(`\n${FIELDS.length - dead.length} of ${FIELDS.length} engine fields do something.`);
if (dead.length) console.log(`DEAD: ${dead.join(", ")}`);
process.exit(0);
