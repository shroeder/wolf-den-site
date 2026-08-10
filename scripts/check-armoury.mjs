// ARMOURY BALANCE GATE. The crates are a gamble, and a gamble whose expected value nobody ever computes drifts
// the moment anybody edits a weight "just a little". This is the computation, kept next to the tables.
//
// Two rules, and they are both about not punishing the player for pressing the button:
//   EV between 1.08x and 1.24x the price — a random reward has to beat the fixed shop it replaced, because you
//   gave up the ability to choose. Above ~1.25x and laurels stop being a sink at all.
//   FLOOR at least half the price — the worst roll in a crate must still feel like something happened.
//
// Run:  node scripts/check-armoury.mjs
import { CRATES, armouryEv, rollable, rollCrate } from "../src/lib/marketplace/armoury.js";

let bad = 0;
for (const c of CRATES) {
    for (const jewels of [true, false]) {
        const ev = armouryEv(c, { jewels });
        const rows = rollable(c, { jewels });
        const floor = Math.min(...rows.map((r) => r.worth));
        const ratio = ev / c.cost;
        const fr = floor / c.cost;
        const ok = ratio >= 1.08 && ratio <= 1.24 && fr >= 0.5;
        if (!ok) bad += 1;
        console.log(`${ok ? "ok " : "BAD"} ${c.name.padEnd(11)} jewels=${String(jewels).padEnd(5)} `
            + `cost ${String(c.cost).padStart(5)}  EV ${String(ev).padStart(5)} (${ratio.toFixed(2)}x)  `
            + `floor ${String(floor).padStart(4)} (${fr.toFixed(2)}x)  ceiling ${Math.max(...rows.map((r) => r.worth))}`);
    }
}
// The tables and the roller must agree — a weight the roller ignores is a balance figure that is fiction.
for (const c of CRATES) {
    let sum = 0; const N = 40000;
    for (let i = 0; i < N; i++) sum += rollCrate(c).worth;
    const sim = Math.round(sum / N); const ev = armouryEv(c);
    const drift = Math.abs(sim - ev) / ev;
    if (drift > 0.03) { bad += 1; console.log(`BAD ${c.name}: simulated ${sim} vs predicted ${ev}`); }
}
console.log(bad ? `\n${bad} problem(s)` : "\nall crates balanced, and the roller matches the tables");
process.exit(bad ? 1 : 0);
