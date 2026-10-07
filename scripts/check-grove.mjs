// ── IS MAP ONE INTERNALLY HONEST? ────────────────────────────────────────────────────────────────────────────
// The Grove is a content map with a lot of cross-references — twelve zones naming enemies, enemies naming
// parts and emblems, recipes naming parts — and every one of those is a string that can be wrong without
// anything throwing. A misspelled part id does not crash; it just silently drops nothing, for ever.
//
// So this holds the content to the rules the design actually promised:
//
//   · every part a player can get is used by AT LEAST ONE recipe (Luke's rule, verbatim)
//   · every enemy a zone names exists
//   · every part an enemy drops exists
//   · every emblem an enemy carries exists
//   · every part a recipe asks for exists
//   · no ordinary enemy pays gold — only the rare spawn
//   · the difficulty actually climbs
//   · the emblem ladder fails UPWARD
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-grove.mjs
import {
    GROVE_PARTS, GROVE_ENEMIES, GROVE_ZONES, GROVE_EMBLEMS, GROVE_RARE,
    emblemStars, scaledFoe, GROVE_POP, EMBLEM_STARS,
} from "@/lib/marketplace/grove-catalog.js";
import { GROVE_RECIPES, discoveredRecipes, TOOL_SLOTS } from "@/lib/marketplace/grove-recipes.js";

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// ── 1. REFERENCES ────────────────────────────────────────────────────────────────────────────────────
for (const z of GROVE_ZONES) {
    for (const e of z.enemies) ok(GROVE_ENEMIES[e], `zone ${z.id}: unknown enemy "${e}"`);
    ok(GROVE_ENEMIES[z.boss], `zone ${z.id}: unknown boss "${z.boss}"`);
    ok(z.toUnlock > 0, `zone ${z.id}: toUnlock must be a kill count`);
}
for (const [id, e] of Object.entries(GROVE_ENEMIES)) {
    ok(GROVE_EMBLEMS[e.emblem], `enemy ${id}: unknown emblem "${e.emblem}"`);
    for (const row of e.loot) ok(GROVE_PARTS[row.part], `enemy ${id}: unknown part "${row.part}"`);
    // ⚠️ THE RULE THAT MATTERS MOST. A kill loop that pays gold is the one faucet shape in this game with
    // no natural daily cap.
    ok(e.gold === undefined, `enemy ${id}: ordinary enemies must not pay gold`);
}
for (const row of GROVE_RARE.loot) ok(GROVE_PARTS[row.part], `rare spawn: unknown part "${row.part}"`);
ok(GROVE_EMBLEMS[GROVE_RARE.emblem], "rare spawn: unknown emblem");
for (const r of GROVE_RECIPES) {
    for (const p of Object.keys(r.parts)) ok(GROVE_PARTS[p], `recipe ${r.id}: unknown part "${p}"`);
}

// ── 2. EVERY PART IS WANTED ──────────────────────────────────────────────────────────────────────────
// Luke: "Each part you can get from an enemy has uses in at least one recipe."
const wanted = new Set(GROVE_RECIPES.flatMap((r) => Object.keys(r.parts)));
for (const id of Object.keys(GROVE_PARTS)) {
    ok(wanted.has(id), `part "${id}" drops but no recipe asks for it — litter in a 16-slot bag`);
}

// ── 3. EVERY PART IS REACHABLE ───────────────────────────────────────────────────────────────────────
// The mirror of the rule above: a recipe asking for a part nothing drops is a recipe nobody can ever make.
const dropped = new Set([
    ...Object.values(GROVE_ENEMIES).flatMap((e) => e.loot.map((l) => l.part)),
    ...GROVE_RARE.loot.map((l) => l.part),
]);
for (const id of Object.keys(GROVE_PARTS)) {
    ok(dropped.has(id), `part "${id}" is in a recipe but nothing drops it`);
}

// ── 4. DIFFICULTY CLIMBS ─────────────────────────────────────────────────────────────────────────────
let lastHp = 0;
for (const z of GROVE_ZONES) {
    const boss = scaledFoe(z.boss, z.n);
    ok(boss.hp > lastHp, `zone ${z.n} (${z.id}): boss is not harder than the one before it`);
    lastHp = boss.hp;
}

// ── 5. THE EMBLEM LADDER FAILS UPWARD ────────────────────────────────────────────────────────────────
// Two of this game's worst bugs were ladders that fell off the end and paid the BOTTOM rung.
// ⚠️ ASSERTED AS PROPERTIES, NOT AS NUMBERS. The first version checked "10 gives 1 star", which was true of
// one particular tuning and started failing the moment the ladder was rebalanced — a test that breaks when
// you tune is a test that teaches you to ignore it. What must hold at ANY tuning: nothing is no stars, the
// first rung is exactly one star, and a huge count keeps the TOP rung rather than falling off the end.
ok(emblemStars(0).stars === 0, "emblem ladder: 0 should be no stars");
ok(emblemStars(EMBLEM_STARS[0].at).stars === 1, "emblem ladder: the first rung should be 1 star");
ok(emblemStars(EMBLEM_STARS[0].at - 1).stars === 0, "emblem ladder: just under the first rung is still 0");
ok(emblemStars(999_999).stars === 6, "emblem ladder: a huge count must keep the TOP rung, not fall to zero");
// And the rungs must climb, or a later one is unreachable.
for (let i = 1; i < EMBLEM_STARS.length; i += 1) {
    ok(EMBLEM_STARS[i].at > EMBLEM_STARS[i - 1].at, `emblem ladder: rung ${i + 1} is not above rung ${i}`);
}

// ── 6. DISCOVERY IS BY SEEN-SET, NOT INVENTORY ───────────────────────────────────────────────────────
const seenAll = new Set(Object.keys(GROVE_PARTS));
ok(discoveredRecipes(seenAll).length === GROVE_RECIPES.length, "seeing every part should unlock every recipe");
ok(discoveredRecipes(new Set()).length === 0, "seeing nothing should unlock nothing");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────────────────
const zones = GROVE_ZONES.length;
const twoTypes = GROVE_ZONES.filter((z) => z.enemies.length > 1).length;
const needArt = [
    ...Object.values(GROVE_ENEMIES).filter((e) => !e.art).map((e) => e.name),
    ...(GROVE_RARE.art ? [] : [GROVE_RARE.name]),
];

console.log(`── THE GROVE ────────────────────────────────────────────────────────────────`);
console.log(`  ${zones} zones (${twoTypes} with two enemy types)   ${Object.keys(GROVE_ENEMIES).length} enemies`);
console.log(`  ${Object.keys(GROVE_PARTS).length} parts   ${GROVE_RECIPES.length} recipes   ${Object.keys(GROVE_EMBLEMS).length} emblems`);
console.log(`  ${TOOL_SLOTS.length} new tool slots: ${TOOL_SLOTS.map((t) => t.name).join(", ")}`);
console.log(`  population ${GROVE_POP.min}-${GROVE_POP.max}, full respawn every ${GROVE_POP.respawnMs / 1000}s`);
console.log(`  rare spawn: ${GROVE_RARE.name} at ${(GROVE_RARE.spawnChance * 100).toFixed(2)}% per enemy`);
console.log(`\n  difficulty curve (zone boss hp):`);
console.log("   ", GROVE_ZONES.map((z) => scaledFoe(z.boss, z.n).hp).join(" → "));
// ── ⚠️ WHAT "RARE" ACTUALLY COSTS, IN SESSIONS ───────────────────────────────────────────────────────
// The drop rate and the star ladder are one number living in two places, and either alone looks perfectly
// reasonable while the PAIR is absurd — 1% a kill against a 1,200 ladder is a hundred thousand kills for six
// stars. So the timeline is printed rather than reasoned about, and any future tuning change shows its own
// consequence on the way past.
const KILLS_PER_SESSION = 500;   // ~20 active minutes against 15-30 enemies refreshing every 45s
console.log(`\n  emblem pace (at ${KILLS_PER_SESSION} kills/session):`);
for (const id of ["rootrat", "thornling", "elderling"]) {
    const e = GROVE_ENEMIES[id];
    const per = e.emblemChance * KILLS_PER_SESSION;
    const row = EMBLEM_STARS.map((r) => `${r.star}*${Math.ceil(r.at / per)}`).join("  ");
    console.log(`    ${e.name.padEnd(13)} ${(e.emblemChance * 100).toFixed(2)}%/kill  ${per.toFixed(2)}/session   sessions to: ${row}`);
}

console.log(`\n  art still to draw (${needArt.length}): ${needArt.join(", ") || "none"}`);
console.log(`  backdrops to draw: ${zones} (one per zone)`);

if (fail.length) {
    console.log(`\n── ${fail.length} PROBLEM(S) ───────────────────────────────────────────────────`);
    for (const f of fail) console.log("  ·", f);
    process.exit(1);
}
console.log("\nOK — every reference resolves, every part is wanted and reachable, nothing pays gold but the rare spawn.");
