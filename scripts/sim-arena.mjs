// ── ARENA BALANCE SIMULATOR ──────────────────────────────────────────────────────────────────────────────────
// It runs the REAL engine now. Nothing below is a copy of a number that lives somewhere else.
//
// WHAT THIS FILE USED TO BE, because it is the reason for every choice in it: a second implementation of the
// engine with the constants copied across by hand, under a header that admitted the danger — "the numbers
// below are copied from it exactly — if they drift, this lies." They drifted. By the time anyone checked, five
// values were wrong and six named mechanics no longer existed; SURGE_MULT was 1.5 here against 0.5 in the
// game, so the simulator was modelling a buff where the game shipped a cut. Balance arguments in this codebase
// cite this tool by number. It was arguing about a game nobody was playing.
//
// The fix was not to re-copy them. It was to make the engine importable: the arithmetic of a beat now lives in
// src/lib/marketplace/arena-engine.js, which has no database in it, and both the game and this file import the
// same functions and the same constants. A retune lands here the moment it lands in the game, because there is
// nothing here to retune.
//
// WHAT IS STILL THIS FILE'S OWN, and honestly so:
//   · WHO DOES WHAT. Which move a fighter throws, when they brace, when they drink. That is policy, not
//     mechanics — the real thing has a person on one end and arena-ai.js on the other, and neither is
//     available to a batch job.
//   · The kit each class is given, since a tree allocation is a player's choice.
//   · Execution: the timing grade a player would hit. Held at a fixed, honest average.
//
// What it CANNOT tell you: anything about the ring, the timing bands, or the UI. It is a numbers harness.
//
// Usage:  node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/sim-arena.mjs [runs]
//         npm run sim
import { CLASSES, classBase, treeAbilities, treeEffects, treeFor } from "../src/lib/marketplace/arena-classes.js";
import {
    accuracyFromFerocity, BLEED_TURNS, DRAIN_SHARE, FEAST_SHARE, FREE_KINDS, guardSoakFrom, healthFrom,
    RIPOSTE_SHARE, SHIELD_CAP, speedOf, SUNDER_CUT, SUNDER_TURNS, swingFrom, WARD_SOAK,
} from "../src/lib/marketplace/arena-kit.js";
// `ringStats` was folded into fighterFrom when NPCs stopped being a special case (see the note at the top of
// arena-engine.js). It was still in this import list and unused — which made the whole module fail to load,
// hidden behind the alias problem that stopped the file starting at all.
import { arenaRating, counterBlow, drinkFor, lightBurn, openWound, throwBlows } from "../src/lib/marketplace/arena-engine.js";
import { npcAbilities, npcFor, tierForRating } from "../src/lib/marketplace/arena-npc.js";

const RUNS = Number(process.argv[2]) || 2000;

import { bout, fighter, fullTree, GEAR, npcFighter } from "./lib/sim-harness.mjs";

console.log(`Arena simulator — ${RUNS} bouts per cell, engine imported from arena-engine.js (nothing copied).\n`);

const rows = [];
for (const cls of CLASSES) {
    for (const [label, gear] of Object.entries(GEAR)) {
        const me = fighter(cls.id, gear, fullTree(cls.id));
        // THE TIER MATCHMAKING WOULD ACTUALLY PICK, plus one either side. Choosing tiers by hand pitted a
        // 2,628-rating member against a 580 and then reported 100% as if it meant something; the game never
        // makes that pairing, so neither should this.
        const seat = tierForRating(arenaRating(fighter(cls.id, gear, fullTree(cls.id))));
        for (const tier of [Math.max(1, seat - 3), seat, seat + 3]) {
            const foe = npcFighter(tier);
            if (!foe) continue;
            let wins = 0;
            let beats = 0;
            for (let i = 0; i < RUNS; i += 1) {
                const r = bout(me, foe);
                if (r.won) wins += 1;
                beats += r.beats;
            }
            rows.push({
                class: cls.name, gear: label, rating: arenaRating(me), tier, foeRating: arenaRating(foe),
                win: `${((wins / RUNS) * 100).toFixed(1)}%`, beats: +(beats / RUNS).toFixed(1),
            });
        }
    }
}
console.table(rows);

// Class against class, which is what the Arena actually pairs.
console.log("\nClass vs class, mid gear:");
const pvp = [];
for (const a of CLASSES) {
    for (const d of CLASSES) {
        if (a.id === d.id) continue;
        const me = fighter(a.id, GEAR.mid, fullTree(a.id));
        const foe = fighter(d.id, GEAR.mid, fullTree(d.id));
        let wins = 0;
        for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
        pvp.push({ attacker: a.name, defender: d.name, win: `${((wins / RUNS) * 100).toFixed(1)}%` });
    }
}
console.table(pvp);
console.log(`\nBleed floor in play: ${BLEED_TURNS} turns minimum, imported not assumed.`);
