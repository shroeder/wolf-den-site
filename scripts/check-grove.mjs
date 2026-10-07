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
import fs from "node:fs";

import {
    GROVE_PARTS, GROVE_ENEMIES, GROVE_ZONES, GROVE_EMBLEMS, GROVE_RARE,
    emblemStars, scaledFoe, GROVE_POP, EMBLEM_STARS,
    GROVE_BOSSES, GROVE_HYPER, BOSS_COOLDOWN_MS, bossHyperChance,
} from "@/lib/marketplace/grove-catalog.js";
import { GROVE_RECIPES, discoveredRecipes, TOOL_SLOTS } from "@/lib/marketplace/grove-recipes.js";
import { pickHyper, rollBoss } from "@/lib/marketplace/grove-roll.js";
import { makeTelegraph } from "@/lib/marketplace/grove-world.js";
import { CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { DECORATIONS } from "@/lib/marketplace/decorations.js";

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// ── 1. REFERENCES ────────────────────────────────────────────────────────────────────────────────────
for (const z of GROVE_ZONES) {
    for (const e of z.enemies) ok(GROVE_ENEMIES[e], `zone ${z.id}: unknown enemy "${e}"`);
    ok(GROVE_BOSSES[z.boss], `zone ${z.id}: unknown boss "${z.boss}"`);
    // ⚠️ A BOSS MUST NOT BE ONE OF THE ZONE'S OWN WANDERERS. Every zone used to name one of its own
    // enemies here, so "the boss" was a creature you had already killed two hundred times with more health
    // on it. This is the assertion that stops that coming back.
    ok(!z.enemies.includes(z.boss), `zone ${z.id}: boss "${z.boss}" is also one of its wandering enemies`);
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
// ⚠️ BOSS HP IS READ STRAIGHT, NOT THROUGH scaledFoe. A boss is authored at the depth it stands at, so
// putting it through the per-zone climb would compound on a number already written for zone 12.
let lastHp = 0;
for (const z of GROVE_ZONES) {
    const boss = GROVE_BOSSES[z.boss];
    if (!boss) continue;
    ok(boss.hp > lastHp, `zone ${z.n} (${z.id}): boss is not harder than the one before it`);
    lastHp = boss.hp;
}

// ── 4b. THE BOSSES THEMSELVES ────────────────────────────────────────────────────────────────────────
for (const [id, b] of Object.entries(GROVE_BOSSES)) {
    ok(GROVE_EMBLEMS[b.emblem], `boss ${id}: unknown emblem "${b.emblem}"`);
    for (const row of b.loot) ok(GROVE_PARTS[row.part], `boss ${id}: unknown part "${row.part}"`);
    // Same rule as the wanderers: the Crystal Stag is the only thing in this feature that mints.
    ok(b.gold === undefined, `boss ${id}: bosses must not pay gold`);
    // Luke asked for "telegraphed attacks". An attack with no wind-up is an unavoidable hit.
    ok(b.attacks?.length > 0, `boss ${id}: no attacks`);
    for (const a of b.attacks || []) {
        ok(a.telegraph > 0, `boss ${id}: attack "${a.kind}" has no telegraph`);
        ok(a.reach > 0, `boss ${id}: attack "${a.kind}" has no reach`);
    }
    // ⚠️ A BOSS PAYS ITS WHOLE TABLE, so a weight on its rows would read as meaningful and decide nothing.
    for (const row of b.loot) ok(row.w === undefined, `boss ${id}: loot row "${row.part}" carries a weight it cannot use`);
}

// ── 4c. ⚠️ EVERY SPRITE PATH POINTS AT A FILE THAT EXISTS ───────────────────────────────────────────
// This is the check that was missing, and four creatures shipped without art because of it: husk, goblin,
// elderling and the Crystal Stag all had art: null while their generated files sat on disk unreferenced.
// A path pointing at nothing is worse — an SSR 404 beats React to the onError event, so the fallback never
// runs and the player gets the browser's broken-image glyph. See img-onerror-fires-before-hydration.
const artMissing = [];
const checkArt = (what, url) => {
    if (!url) { artMissing.push(`${what}: no art at all`); return; }
    if (!fs.existsSync(`public${url}`)) artMissing.push(`${what}: ${url} does not exist`);
};
for (const [id, e] of Object.entries(GROVE_ENEMIES)) checkArt(`enemy ${id}`, e.art);
for (const [id, b] of Object.entries(GROVE_BOSSES)) checkArt(`boss ${id}`, b.art);
checkArt("rare spawn", GROVE_RARE.art);
for (const z of GROVE_ZONES) checkArt(`zone ${z.id}`, z.bg);
for (const m of artMissing) ok(false, m);

// ── 4d. ⚠️ THE TELEGRAPH MUST KEY ON THE BODY, NOT THE TYPE ─────────────────────────────────────────
// The regression guard for the worst silent bug this feature had. makeTelegraph stored foe.id (the TYPE,
// "rootrat") and the scene resolved it against f.uid (the BODY, "f17-480213"). It never matched, so every
// attack in the Grove fell through to a hardcoded 5 damage — the Elderling's [31, 47], every boss number
// and the entire dmgPerZone climb did nothing, in all twelve zones, and the build was perfectly happy.
{
    const body = { id: "rootrat", uid: "f17-480213", telegraph: 600, dmg: [1, 2] };
    const tels = makeTelegraph(body, 50, 0);
    ok(Array.isArray(tels), "makeTelegraph must return a list (a volley lands in several places)");
    ok(tels[0]?.foeUid === body.uid, "telegraph must key on the body uid, not the enemy type");
    ok(tels[0]?.foeUid !== body.id, "telegraph keyed on the enemy TYPE — this is the flat-5-damage bug");
    // A volley is three bands, centred, with a gap to stand in.
    const volley = makeTelegraph(body, 50, 0, { kind: "volley", reach: 9, telegraph: 800, shots: 3, spread: 22 });
    ok(volley.length === 3, "a 3-shot volley must make 3 telegraphs");
    ok(volley.some((t) => t.x === 50), "a centred volley must put one band on the target");
    ok(Math.max(...volley.map((t) => t.x)) - Math.min(...volley.map((t) => t.x)) > 9 * 2,
        "a volley with no gap between bands is not a telegraph, it is a tax");
}

// ── 4e. THE HYPER-RARE TABLE ─────────────────────────────────────────────────────────────────────────
for (const h of GROVE_HYPER) {
    if (h.kind === "consumable") {
        ok(CONSUMABLES[h.ref], `hyper ${h.id}: unknown consumable "${h.ref}"`);
        // ⚠️ price: null OR IT IS NOT A PRIZE. A hyper-rare you can walk into the shop and buy is a rounding
        // error on your gold, not a once-in-a-thousand-kills moment.
        ok(CONSUMABLES[h.ref]?.price == null, `hyper ${h.id}: "${h.ref}" is purchasable, so it is not a prize`);
    }
    ok(["consumable", "stone", "ship_upgrade"].includes(h.kind), `hyper ${h.id}: kind "${h.kind}" is not handled by grantHyper`);
    ok(h.w > 0 && h.minZone >= 1, `hyper ${h.id}: bad weight or floor`);
}
// ⚠️ THE FLOOR FAILS UPWARD. The deepest boss must be eligible for EVERYTHING, not just its own rung.
// Three bugs in this codebase have been ladders that matched only their own step and fell back to the
// cheapest prize. See ladder-lookups-must-fail-upward.
{
    const atDepth = (z) => {
        const got = new Set();
        for (let i = 0; i < 20000; i += 1) { const x = pickHyper(z, i / 20000, GROVE_HYPER); if (x) got.add(x); }
        return got;
    };
    const deep = atDepth(GROVE_ZONES.length);
    ok(deep.size === GROVE_HYPER.length, `the deepest boss can only win ${deep.size} of ${GROVE_HYPER.length} hyper-rares — the floor is failing downward`);
    let last = 0;
    for (const z of GROVE_ZONES) {
        const n = atDepth(z.n).size;
        ok(n >= last, `zone ${z.n}: fewer hyper-rares available than the zone before it`);
        last = n;
    }
    ok(atDepth(1).size >= 1, "zone 1 bosses can win nothing at all");
}

// ── 4f. THE FARM GRANTS EXIST ────────────────────────────────────────────────────────────────────────
// ⚠️ THE RECIPE ID *IS* THE DECORATION ID. groveCraft hands recipe.id straight to grantDecoration, which
// refuses anything not in the catalogue — so a mismatch here is a craft that spends the parts and gives
// nothing. They were authored to the same key on purpose; this is what holds them there.
// ⚠️ AND THE CATALOGUE MUST NOT CONTAIN THE SAME ID TWICE. It is a flat 129-row array with no key on it,
// and the first Grove decorations were authored as deco_stump and deco_lantern — both of which were already
// taken by common shop props. Nothing errored: DECORATIONS.find returns whichever comes first, so crafting a
// Mothlight Lantern would have handed over a 350-gold Paper Lantern, and the sprite generator redrew the shop
// one. A shared catalogue with duplicate keys is two different items wearing one name.
{
    const seenDeco = new Set();
    for (const d of DECORATIONS) {
        ok(!seenDeco.has(d.id), `decoration id "${d.id}" appears more than once in DECORATIONS`);
        seenDeco.add(d.id);
    }
}
for (const r of GROVE_RECIPES.filter((x) => x.kind === "deco")) {
    const d = DECORATIONS.find((x) => x.id === r.id);
    ok(d, `recipe ${r.id}: no decoration with that id, so the craft would grant nothing`);
    ok(d?.source === "grove", `decoration ${r.id}: source "${d?.source}" — a Grove deco must be unreachable by the shops and the wheel`);
    ok(d?.price == null, `decoration ${r.id}: has a price, so it is also buyable`);
}
ok(GROVE_RECIPES.filter((x) => x.kind === "plot").length === 2, "Luke said two extra plots, ever");

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
console.log(`  ${Object.keys(GROVE_BOSSES).length} bosses, back up every ${BOSS_COOLDOWN_MS / 60000} min   ${GROVE_HYPER.length} hyper-rares`);
console.log(`\n  difficulty curve (zone boss hp):`);
console.log("   ", GROVE_ZONES.map((z) => GROVE_BOSSES[z.boss].hp).join(" → "));
console.log(`  boss hyper-rare rate: zone 1 ${(bossHyperChance(1) * 100).toFixed(2)}%  ->  zone ${GROVE_ZONES.length} ${(bossHyperChance(GROVE_ZONES.length) * 100).toFixed(2)}%`);
{
    // What the deepest boss actually pays, measured rather than reasoned about - the same discipline the
    // emblem pace table below exists for.
    const N = 120000;
    const deep = GROVE_BOSSES[GROVE_ZONES[GROVE_ZONES.length - 1].boss];
    const hc = bossHyperChance(GROVE_ZONES.length);
    let hits = 0;
    const tally = {};
    for (let i = 0; i < N; i += 1) {
        const g = rollBoss(deep, GROVE_ZONES.length, 4242, i, {}, hc, GROVE_HYPER);
        if (g.hyper) { hits += 1; tally[g.hyper] = (tally[g.hyper] || 0) + 1; }
    }
    const hours = ((N / hits) * (BOSS_COOLDOWN_MS / 3600000)).toFixed(0);
    console.log(`    1 in ${Math.round(N / hits)} kills of ${deep.name} = about ${hours}h of fighting only him`);
    const rarest = Object.entries(tally).sort((a2, b2) => a2[1] - b2[1])[0];
    console.log(`    rarest of them: ${rarest[0]} at 1 in ${Math.round(N / rarest[1])} boss kills`);
}
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
