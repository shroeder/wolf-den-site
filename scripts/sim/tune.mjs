// TUNER. Sweeps candidate balance settings through the real resolver and prints the resulting ladder, so the
// numbers are chosen against measured win rates and fight lengths rather than against intuition.
//
// Nothing here edits the game — foeProfile already honours an explicit `hits`, the player's hull is overridden
// on the profile object, and AMMO is a plain object. Whatever wins gets written into the real files after.
import * as B from "../../src/lib/marketplace/ship-battle.js";
import { FLEET } from "../../src/lib/marketplace/fleet.js";

const N = 400;

function playerAims(st, plan) {
    const live = st.me.guns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0);
    // A competent captain: shred canvas while she still has some (it drops her evasion), then timber.
    const zone = plan === "smart" && st.foe.sails > 3 ? "sails" : "hull";
    return live.map((g) => ({ gun: g, zone, ammo: "round" }));
}

function fight(me, foe, plan) {
    let st = B.initBattleState(me, foe);
    for (let round = 1; round <= 60; round += 1) {
        const out = B.resolveVolley(me, foe, st, playerAims(st, plan), {});
        st = out.state;
        if (out.over) return { rounds: round, win: out.win };
    }
    return { rounds: 60, win: false, timeout: true };
}

export function run(cfg, label) {
    // Apply the candidate ammunition change (mutating the shared table is fine in a throwaway process).
    const savedExpAcc = B.AMMO.explosive.accuracy;
    const savedExpHull = B.AMMO.explosive.hull;
    if (cfg.explosive) {
        B.AMMO.explosive.accuracy = cfg.explosive.accuracy;
        B.AMMO.explosive.hull = cfg.explosive.hull;
    }

    console.log(`\n=== ${label} ===`);
    console.log("rank  ship                      you  her    win%  rounds p50  p90  timeouts");
    const winRates = [];
    for (const ship of FLEET) {
        const b = cfg.build(ship.rank);
        const me = B.shipProfile({ name: "me", ...b, ammo: "round" });
        me.hp = cfg.playerHull(b);
        const foe = B.foeProfile({ ...ship, ...(cfg.foeTweak ? cfg.foeTweak(ship.rank) : {}), hits: cfg.foeHits(ship.rank) });
        const rounds = [];
        let wins = 0, timeouts = 0;
        for (let i = 0; i < N; i += 1) {
            const r = fight(me, foe, cfg.plan || "smart");
            rounds.push(r.rounds);
            if (r.win) wins += 1;
            if (r.timeout) timeouts += 1;
        }
        rounds.sort((a, z) => a - z);
        const p = (q) => rounds[Math.min(rounds.length - 1, Math.floor(rounds.length * q))];
        const wr = Math.round((wins / N) * 100);
        winRates.push(wr);
        console.log(
            String(ship.rank).padStart(4) + "  " + ship.name.padEnd(25)
            + String(me.hp).padStart(4) + String(foe.hp).padStart(5)
            + String(wr).padStart(8) + "%"
            + String(p(0.5)).padStart(9) + String(p(0.9)).padStart(5)
            + String(timeouts).padStart(10)
        );
    }
    // A ladder should get harder. Count the rungs that are EASIER than the one below them.
    let inversions = 0;
    for (let i = 1; i < winRates.length; i += 1) if (winRates[i] > winRates[i - 1] + 6) inversions += 1;
    console.log(`inversions (a rung easier than the one below it): ${inversions}`);

    B.AMMO.explosive.accuracy = savedExpAcc;
    B.AMMO.explosive.hull = savedExpHull;
}
