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
// ── ⚠️ MOST OF THIS FILE WAS ABOUT PARTS, AND CAME OUT ON 2026-11-08 ──────────────────────────────────────────
// Luke: "I think we remove monster part items, remove crafting all together." Four groups of assertions went
// with their subject, named here so nobody looks for them in the history wondering what broke:
//
//   · EVERY CREATURE IS REWARDING TO KILL — that all 84 creatures had a rare drop of their OWN, that it
//     named a part that exists, that it was never just their own common, and that one rare rate covered the
//     whole game rather than a table per map. The rare row is deleted from rollKill.
//   · THE WINDFALL — that spanTailed's long tail turned an authored [1,2] into an occasional big pile, that
//     the ordinary band stayed the normal case above 75%, and that a windfall stayed under 0.5%. DROP_TAIL
//     and spanTailed are both deleted.
//   · the `rare` arm of the surprise sweep, which counted deeper-map parts landing on ordinary kills.
//   · THE WORKBENCH DOES NOT SHOW A WALL — that reachableRecipes was a strict subset of the book and that
//     every reachable recipe asked only for parts that exist. There is no workbench.
//
// ⚠️ THE RECIPE AND PART CATALOGUES STILL EXIST AS DATA, which is why those last two could have been kept
// passing. They are not, deliberately: a gate over data nothing reads proves nothing and is the kind of
// green tick that reads as coverage. check:grove still asserts the catalogues' internal integrity.
//
//   node scripts/check-grove-loot.mjs        (or npm run check:grove-loot)
import { rollKill } from "../src/lib/marketplace/grove-roll.js";
import {
    GROVE_ENEMIES, GROVE_HYPER, wandererHyperChance, bossHyperChance,
} from "../src/lib/marketplace/grove-catalog.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

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
for (let i = 0; i < 300000; i += 1) {
    const got = rollKill(foe, 5150 + i, i, {}, 4, GROVE_HYPER);
    if (got.hyper) hyper += 1;
}
const hyperEvery = Math.round(300000 / Math.max(1, hyper));
ok(`a hyper-rare lands about every ${hyperEvery} kills`, hyperEvery > 400 && hyperEvery < 6000);
// The boss must stay the reliable route; the wanderer roll is the lightning strike.
ok("a boss is still far likelier to pay a hyper than a wanderer",
    bossHyperChance(4) > wandererHyperChance(4) * 5,
    `boss ${bossHyperChance(4)} vs wanderer ${wandererHyperChance(4)}`);
ok("both climb with depth", wandererHyperChance(12) > wandererHyperChance(1));

// ── ⚠️ GEAR IS THE WHOLE REWARD NOW, AND IT IS GUARDED NEXT DOOR ─────────────────────────────────────────────
// With parts gone, a kill pays gear, an emblem, a statue, gold on a rare spawn, xp and the hyper sliver —
// and the gear tables are asserted by check:grove-roll, which prints the on-ramp rate against the frontier
// rate and the depth floor for a set piece. Not duplicated here: two gates over one table is two places to
// update and one of them will be the one that rots.

// ⚠️ "A CHEST CONTAINS SOMETHING YOU CANNOT FARM" STOOD HERE — four assertions about chest contents and
// the hyperFloor ladder. Removed with the Grove's chests; nothing it guarded exists any more.

console.log(fails ? `\ncheck:grove-loot — ${fails} FAILED\n` : "\nOK — a kill is a roll, both sides agree on it, and the hyper table is still the surprise.\n");
process.exit(fails ? 1 : 0);
