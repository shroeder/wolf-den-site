// ── IS A KILL WORTH WATCHING? ─────────────────────────────────────────────────────────────────────────────────
// Luke, after reading the live drop tables: "are the drops fun, am I rewarded for killing a unique monster,
// am I suprised by rare events drops, or is it super predictable".
//
// It was super predictable and this file is what stops it going back. The failure was not a bug anywhere --
// every table was internally consistent, every number was deliberate, and the result was that all 84
// creatures in the game ran the identical machine and produced one of three outcomes forever. That is the
// kind of defect no screenshot and no unit test catches, because nothing is WRONG; the shape is just flat.
//
// So these assert the SHAPE of the reward curve rather than any single number.
//
//   node scripts/check-grove-loot.mjs        (or npm run check:grove-loot)
import {
    rollKill, spanTailed, DROP_TAIL, rngFrom,
} from "../src/lib/marketplace/grove-roll.js";
import {
    GROVE_ENEMIES, GROVE_HYPER, GROVE_PARTS, wandererHyperChance, bossHyperChance,
} from "../src/lib/marketplace/grove-catalog.js";
import { GROVE_CHESTS } from "../src/lib/marketplace/grove-forge.js";
import { reachableRecipes, GROVE_RECIPES } from "../src/lib/marketplace/grove-recipes.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

console.log("\nEVERY CREATURE IS REWARDING TO KILL");
const foes = Object.values(GROVE_ENEMIES);
// ⚠️ THE ONE THAT MATTERS. Before the rare row, all 84 creatures had exactly two loot rows and the only
// thing separating a rootrat from the deepest thing in the forest was the NAME of the common it dropped.
const noRare = foes.filter((f) => !f.rareLoot?.part);
ok(`all ${foes.length} creatures have a rare drop of their own`, noRare.length === 0,
    noRare.slice(0, 4).map((f) => f.name).join(", "));
// ⚠️ AND IT MUST NAME A REAL PART. creatureRareLoot indexes into the NEXT map's part list; running off the
// end would have written { part: undefined } onto twelve creatures and put a part called "undefined" into
// a player's bag. A lookup that runs off the end has to land somewhere real.
// See [[ladder-lookups-must-fail-upward]].
const ghosts = foes.filter((f) => f.rareLoot?.part && !GROVE_PARTS[f.rareLoot.part]);
ok("every rare drop names a part that exists", ghosts.length === 0,
    ghosts.slice(0, 4).map((f) => `${f.name} -> ${f.rareLoot.part}`).join(", "));
// A rare drop that is the creature's own common is not a rare drop.
const sameAsCommon = foes.filter((f) => (f.loot || []).some((l) => l.part === f.rareLoot?.part));
ok("a rare drop is never just the creature's own common", sameAsCommon.length === 0,
    sameAsCommon.slice(0, 4).map((f) => f.name).join(", "));
const rates = [...new Set(foes.map((f) => f.rareChance))];
ok("one rare rate for the whole game, not a table per map", rates.length === 1, `got ${rates.join(", ")}`);

console.log("\nA KILL IS A ROLL, NOT A DEALT CARD");
const r = rngFrom(20261020);
const counts = {};
const bands = {};
for (let i = 0; i < 200000; i += 1) {
    const { n, band } = spanTailed([1, 2], r());
    counts[n] = (counts[n] || 0) + 1;
    bands[String(band)] = (bands[String(band)] || 0) + 1;
}
const distinct = Object.keys(counts).length;
// Twenty consecutive Bristlebacks used to produce "1x hide", "2x hide", "1x antler" and nothing else, ever.
ok(`a [1,2] part can land on more than a handful of amounts (${distinct} distinct)`, distinct >= 8,
    `only ${distinct}: ${Object.keys(counts).join(",")}`);
ok("the authored band is still the normal case", (bands.null / 200000) > 0.75,
    `ordinary ${(100 * bands.null / 200000).toFixed(1)}%`);
ok("a windfall is rare enough to be worth telling somebody about",
    (bands.windfall / 200000) < 0.005 && bands.windfall > 0,
    `windfall ${(100 * (bands.windfall || 0) / 200000).toFixed(3)}%`);
ok("the bands come out of the roll rather than being guessed from the number",
    DROP_TAIL.every((t) => "band" in t));
// ⚠️ THE PROPERTY THAT ACTUALLY MATTERS, and the one the first cut of this failed silently. A "handful"
// that lands on 2 for a [1,2] part is indistinguishable from an ordinary roll -- the tag says something
// special happened and the number says it did not. Every tail band must exceed every ordinary result.
for (const band of ["handful", "haul", "windfall"]) {
    const at = DROP_TAIL.findIndex((t) => t.band === band);
    const lo = at === 0 ? 0 : DROP_TAIL[at - 1].upTo;
    let worst = Infinity;
    for (let i = 0; i <= 200; i += 1) {
        const u = lo + ((DROP_TAIL[at].upTo - lo) * i) / 200 - 1e-9;
        const got = spanTailed([1, 2], Math.max(lo, u));
        if (got.band === band) worst = Math.min(worst, got.n);
    }
    ok(`a ${band} of a [1,2] part always beats an ordinary roll (smallest ${worst})`, worst > 2, `got ${worst}`);
}
console.log(`     ${Object.entries(bands).map(([k, v]) => `${k}:${(100 * v / 200000).toFixed(1)}%`).join("  ")}`);

console.log("\nTHE ROLL SPENDS THE SAME NUMBER OF DRAWS AS IT ALWAYS DID");
// ⚠️ THE CONTRACT OF THIS WHOLE FILE. The server replays the seeded stream to verify a settle, so the
// number of r() calls per kill is part of the wire format: spend one more here and every roll after it in
// the same kill lands somewhere else, and the player watches a drop fall that never arrives.
let draws = 0;
const counting = () => { draws += 1; return 0.5; };
spanTailed([1, 3], counting());
ok("spanTailed spends exactly one draw, as span() did", draws === 1, `spent ${draws}`);

console.log("\nTHE SAME KILL ALWAYS ROLLS THE SAME THING ON BOTH SIDES");
const foe = GROVE_ENEMIES.badger;
for (const i of [0, 7, 41, 999]) {
    const a = JSON.stringify(rollKill(foe, 918273, i, {}, 4, GROVE_HYPER));
    const b = JSON.stringify(rollKill(foe, 918273, i, {}, 4, GROVE_HYPER));
    ok(`kill ${i} is deterministic`, a === b);
}
// And the no-argument form must not throw — an un-updated caller is missing a feature, never broken.
ok("an old-shaped call still works", typeof rollKill(foe, 1, 1, {}).xp === "number");
ok("...and rolls no hyper, rather than rolling a different stream",
    rollKill(foe, 1, 1, {}).hyper === null);

console.log("\nTHERE IS SOMETHING TO BE SURPRISED BY");
let hyper = 0;
let rare = 0;
for (let i = 0; i < 300000; i += 1) {
    const got = rollKill(foe, 5150 + i, i, {}, 4, GROVE_HYPER);
    if (got.hyper) hyper += 1;
    if (got.rare) rare += 1;
}
const rareEvery = Math.round(300000 / Math.max(1, rare));
const hyperEvery = Math.round(300000 / Math.max(1, hyper));
ok(`a rare drop lands about every ${rareEvery} kills`, rareEvery > 15 && rareEvery < 60);
ok(`a hyper-rare lands about every ${hyperEvery} kills`, hyperEvery > 400 && hyperEvery < 6000);
// The boss must stay the reliable route; the wanderer roll is the lightning strike.
ok("a boss is still far likelier to pay a hyper than a wanderer",
    bossHyperChance(4) > wandererHyperChance(4) * 5,
    `boss ${bossHyperChance(4)} vs wanderer ${wandererHyperChance(4)}`);
ok("both climb with depth", wandererHyperChance(12) > wandererHyperChance(1));

console.log("\nA CHEST CONTAINS SOMETHING YOU CANNOT FARM");
// A chest whose whole payload is bulk parts is a bigger pile of what the player already has too much of --
// measured live: 4-8 Bristle Hide to somebody holding 71, and five chests left unopened because of it.
for (const [id, c] of Object.entries(GROVE_CHESTS)) {
    ok(`${c.name} can pay a hyper-rare`, Number(c.hyperChance) > 0, `got ${c.hyperChance}`);
    ok(`${c.name} pays merits, which only a boss and a chest ever do`, Array.isArray(c.merits));
}
const floors = Object.values(GROVE_CHESTS).map((c) => c.hyperFloor);
ok("a shallow chest cannot pay a deep reward", floors.every((f, i) => i === 0 || f > floors[i - 1]),
    `floors ${floors.join(",")}`);

console.log("\nTHE WORKBENCH DOES NOT SHOW A WALL");
const reach = reachableRecipes().length;
ok(`only reachable recipes are counted (${reach} of ${GROVE_RECIPES.length})`, reach < GROVE_RECIPES.length && reach > 0);
ok("every reachable recipe needs only parts that exist",
    reachableRecipes().every((x) => Object.keys(x.parts).every((pt) => GROVE_PARTS[pt])));

console.log(fails ? `\ncheck:grove-loot — ${fails} FAILED\n` : "\nOK — every creature pays its own rare, a kill is a roll, a chest holds something you cannot farm.\n");
process.exit(fails ? 1 : 0);
