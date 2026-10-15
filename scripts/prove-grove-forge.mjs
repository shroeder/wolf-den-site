// ── PROVE THE GROVE'S FORGE ECONOMY ─────────────────────────────────────────────────────────────────────────
// Crafting levels, quality rolls, chest tiers, boss merits -- four curves that are easy to write and hard to
// feel. This prints them so they can be argued with before anybody plays them.
//
//   npm run prove:forge
//
// Pure maths. Touches no database and no network.
const { craftLevel, craftXpForLevel, craftXpFor, rollQuality, qualityBand, toolBonusFor,
    GROVE_CHESTS, GROVE_CHEST_ORDER, chestForZone, bossChestChance, bossMerits,
    setRarityForZone, CRAFT_LEVEL_CAP, ARMOUR_PIECES, GROVE_SETS, GROVE_SET_ORDER, setBonusFor,
    ARMOUR_SLOTS } = await import("../src/lib/marketplace/grove-forge.js");
const { GROVE_RECIPES, toolBonusPct } = await import("../src/lib/marketplace/grove-recipes.js");

const pad = (s, n) => String(s).padEnd(n);
const rp = (s, n) => String(s).padStart(n);
const rule = (c = "─") => console.log(c.repeat(86));

console.log();
rule("═");
console.log("  THE CRAFTING LADDER");
rule("═");
console.log(`  ${pad("level", 7)}${rp("xp to reach", 13)}${rp("step", 9)}${rp("tool crafts", 13)}${rp("poultices", 12)}`);
const toolXp = craftXpFor(GROVE_RECIPES.find((r) => r.id === "pick_t1"));
const foodXp = craftXpFor(GROVE_RECIPES.find((r) => r.id === "food_poultice"));
for (const lv of [2, 3, 5, 8, 12, 16, 20, CRAFT_LEVEL_CAP]) {
    const at = craftXpForLevel(lv);
    const prev = craftXpForLevel(lv - 1);
    console.log(`  ${pad(lv, 7)}${rp(at.toLocaleString(), 13)}${rp((at - prev).toLocaleString(), 9)}`
        + `${rp(Math.ceil(at / toolXp), 13)}${rp(Math.ceil(at / foodXp), 12)}`);
}
console.log();
console.log(`  one tool craft pays ${toolXp} xp · one poultice pays ${foodXp}`);
console.log("  >> food is deliberately the worst per craft, or it becomes the only thing worth making.");

console.log();
rule();
console.log("  WHAT A LEVEL BUYS: quality rolls, 20,000 samples per level");
rule();
console.log(`  ${pad("level", 7)}${rp("rough", 9)}${rp("sound", 9)}${rp("fine", 9)}${rp("pristine", 10)}${rp("avg q", 8)}${rp("rod bonus", 11)}`);
let seed = 123456789;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
for (const lv of [1, 3, 5, 8, 12, 16, 20, CRAFT_LEVEL_CAP]) {
    const tally = { rough: 0, sound: 0, fine: 0, pristine: 0 };
    let sum = 0;
    // The MEAN OF THE BONUS, not the bonus at the mean. Banding an average hides the whole effect:
    // an average that never crosses a band boundary prints the same number at every level.
    let bonusSum = 0;
    const N = 20000;
    for (let i = 0; i < N; i += 1) {
        const q = rollQuality(lv, rnd);
        sum += q;
        tally[qualityBand(q).id] += 1;
        bonusSum += toolBonusFor(1, q);
    }
    const pc = (n) => `${((n / N) * 100).toFixed(1)}%`;
    const avg = sum / N;
    console.log(`  ${pad(lv, 7)}${rp(pc(tally.rough), 9)}${rp(pc(tally.sound), 9)}${rp(pc(tally.fine), 9)}`
        + `${rp(pc(tally.pristine), 10)}${rp(avg.toFixed(1), 8)}${rp((bonusSum / N).toFixed(2) + '%', 11)}`);
}
console.log();
console.log(`  a tier-1 tool is ${toolBonusPct(1)}% before quality; Pristine multiplies it to ${toolBonusFor(1, 95)}%.`);
console.log("  >> the level lifts the FLOOR, not the ceiling: a level-1 crafter can still luck into a fine");
console.log("     rod, and Pristine stays something to be pleased about at every level.");

console.log();
rule();
console.log("  THE BOSS TABLE, BY ZONE");
rule();
console.log(`  ${pad("zone", 6)}${pad("chest", 24)}${rp("chest odds", 12)}${rp("merits", 9)}  set rarity`);
for (let n = 1; n <= 12; n += 1) {
    const c = chestForZone(n);
    console.log(`  ${pad(n, 6)}${pad(c.name, 24)}${rp(`${Math.round(bossChestChance(n) * 100)}%`, 12)}`
        + `${rp(bossMerits(n), 9)}  ${setRarityForZone(n).name}`);
}

console.log();
rule();
console.log("  WHAT EACH CHEST PAYS (expected, per open)");
rule();
for (const id of GROVE_CHEST_ORDER) {
    const c = GROVE_CHESTS[id];
    const rows = c.parts.map((r) => {
        const mid = (r.n[0] + r.n[1]) / 2;
        return `${r.part} ${(mid * (r.chance ?? 1)).toFixed(1)}`;
    });
    console.log(`  ${pad(c.name, 24)} merits ${rp(`${c.merits[0]}-${c.merits[1]}`, 7)}   ${rows.join(" · ")}`);
}

console.log();
rule();
console.log("  THE BOSS SETS -- WHAT MERITS ARE ACTUALLY FOR");
rule();
console.log(`  ${pad("set", 15)}${pad("rarity", 11)}${pad("zones", 8)}${rp("merits", 8)}   stats at 3/3 (pieces + set bonus)`);
for (const id of GROVE_SET_ORDER) {
    const set = GROVE_SETS[id];
    const ps = ARMOUR_PIECES.filter((x) => x.setId === id);
    const merits = ps.reduce((n, x) => n + x.merits, 0);
    const total = {};
    for (const x of ps) for (const [k, v] of Object.entries(x.stats)) total[k] = (total[k] || 0) + v;
    for (const [k, v] of Object.entries(setBonusFor(id))) total[k] = Math.round(((total[k] || 0) + v) * 100) / 100;
    console.log(`  ${pad(set.name, 15)}${pad(id, 11)}${pad(set.zones.join("-"), 8)}${rp(merits, 8)}   `
        + Object.entries(total).map(([k, v]) => `${k} ${v}`).join(" · "));
    console.log(`  ${" ".repeat(42)}each piece also costs ${ps[0].parts.map((r) => `${r.n} ${r.part}`).join(" + ")}`);
}

// ⚠️ THE CHECK THE MISSING GATE USED TO DO. A set whose pieces share a slot can never be completed, so its
// set bonus is unreachable and NOTHING ON SCREEN SAYS SO. See worn-sets-need-distinct-slots.
let slotFault = 0;
for (const id of GROVE_SET_ORDER) {
    const slots = ARMOUR_PIECES.filter((x) => x.setId === id).map((x) => x.slot);
    if (new Set(slots).size !== slots.length || slots.length !== ARMOUR_SLOTS.length) {
        console.log(`  !! ${id} cannot be completed: slots ${slots.join(",")}`);
        slotFault += 1;
    }
}
console.log();
console.log(slotFault ? `  !! ${slotFault} SET(S) UNCOMPLETABLE` : "  every set has one piece in each of the three slots, so 3/3 is reachable.");

console.log();
rule();
console.log("  ⚠ THE SINK CHECK");
rule();
// A currency with a faucet and no sink is the thing every economy note in this repo is about.
let lifetimeMerits = 0;
for (let n = 1; n <= 12; n += 1) lifetimeMerits += bossMerits(n);
console.log(`  clearing every boss once pays ${lifetimeMerits} merits.`);
console.log(`  repeatable on a 30-minute cooldown per zone, so merits are uncapped over time.`);
const allSets = GROVE_SET_ORDER.reduce((n, id) =>
    n + ARMOUR_PIECES.filter((x) => x.setId === id).reduce((m, x) => m + x.merits, 0), 0);
console.log(`  every piece of every set costs ${allSets} merits -- ${(allSets / lifetimeMerits).toFixed(1)}x one full clear.`);
console.log(`  THE SETS ARE THE ONLY SINK. Priced against the repeat, not against the first clear.`);
console.log();
