// FLEET BALANCE SIMULATOR.
//
// Runs whole battles through the real resolver — same hit rolls, same armour, same evasion, same foe AI — and
// reports how long a rung takes and how often you win it. Guessing at these numbers from the formulas is how
// you end up with a ladder whose fifth rung dies in two volleys.
//
// HOW TO RUN. ship-battle.js reaches ship-zones.js through the "@/" alias, which plain node does not know, so
// this needs a resolver:
//   node --experimental-loader ./scripts/sim/alias-loader.mjs scripts/sim/sim.mjs
import * as B from "../../src/lib/marketplace/ship-battle.js";
import { FLEET } from "../../src/lib/marketplace/fleet.js";

// The player, laying every gun on the same part. Hull is the honest baseline: no side effects, full damage.
// (Aiming canvas first is stronger over a long fight; that is the point of canvas, and it is measured below.)
function playerAims(st, plan) {
    const live = st.me.guns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0);
    const zone = plan === "sails-first" && st.foe.sails > 0 ? "sails" : "hull";
    return live.map((g) => ({ gun: g, zone, ammo: "round" }));
}

function fight(me, foe, plan = "hull") {
    let st = B.initBattleState(me, foe);
    for (let round = 1; round <= 40; round += 1) {
        const out = B.resolveVolley(me, foe, st, playerAims(st, plan), {});
        st = out.state;
        if (out.over) return { rounds: round, win: out.win, myHp: st.me.hp, foeHp: st.foe.hp };
    }
    return { rounds: 40, win: false, timeout: true, myHp: st.me.hp, foeHp: st.foe.hp };
}

// What a captain plausibly has when they arrive at a given rung: tracks climb roughly half a level a rung,
// and the boat comes along with them. Not exact — it is a yardstick, and the same yardstick before and after.
const buildFor = (rank) => ({
    boatLevel: Math.min(40, 4 + rank * 2),
    gunLevel: Math.min(B.COMBAT_TRACKS.guns.max, Math.round(rank * 0.5)),
    gunneryLevel: Math.min(B.COMBAT_TRACKS.gunnery.max, Math.round(rank * 0.55)),
    hullLevel: Math.min(B.COMBAT_TRACKS.hull.max, Math.round(rank * 0.55)),
});

const N = 400;
const plan = process.argv.includes("--sails") ? "sails-first" : "hull";
console.log(`plan: ${plan}, ${N} fights per rung\n`);
console.log("rank  ship                     yourGuns/hull  herGuns/hull   win%   rounds p50  p90  timeouts");
for (const ship of FLEET) {
    const b = buildFor(ship.rank);
    const me = B.shipProfile({ name: "me", ...b, ammo: "round" });
    const foe = B.foeProfile(ship);
    const rounds = [];
    let wins = 0, timeouts = 0;
    for (let i = 0; i < N; i += 1) {
        const r = fight(me, foe, plan);
        rounds.push(r.rounds);
        if (r.win) wins += 1;
        if (r.timeout) timeouts += 1;
    }
    rounds.sort((a, z) => a - z);
    const p = (q) => rounds[Math.min(rounds.length - 1, Math.floor(rounds.length * q))];
    console.log(
        String(ship.rank).padStart(4)
        + "  " + ship.name.padEnd(24)
        + `${String(me.guns).padStart(2)} / ${String(me.hp).padEnd(2)}`.padEnd(15)
        + `${String(foe.guns).padStart(2)} / ${String(foe.hp).padEnd(2)}`.padEnd(15)
        + `${String(Math.round((wins / N) * 100)).padStart(4)}%`
        + `${String(p(0.5)).padStart(11)}${String(p(0.9)).padStart(5)}`
        + `${String(timeouts).padStart(10)}`
    );
}
