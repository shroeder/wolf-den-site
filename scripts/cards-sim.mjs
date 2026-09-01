// ── DOES READING THE INTENT PAY? ─────────────────────────────────────────────────────────────────────────────
// The one question a fight in this shape has to answer. Two bots play the same seeds: one swings every turn,
// one reads what the foe has announced and covers the big swing. If they finish level, the intent above its
// head is decoration and the fight holds no decision — which is exactly what the first draft measured, and why
// this foe has 60 HP rather than the 45 it was designed with.
//
// It also found the counter-intuitive half: making the foe hit HARDER made blocking worse, not better. Five
// block against a twenty-six point swing barely dents it and costs a turn of damage, so the reader died more
// often than the swinger. Partial block is a trap; block has to be able to cover the thing it is blocking.
//
// Run it before changing a card, a foe script, or a health total:
//   node scripts/cards-sim.mjs
import * as m from "../src/lib/marketplace/cards-kit.js";

// Two policies. If the fight is worth playing, these must not score the same: someone who reads the intent and
// covers the big swing should walk out clearly better off than someone who swings every turn. If they score
// the same, the intent above the foe's head is decoration.
const blockOf = (c) => m.cardById(c.id).block || 0;
const dmgOf = (c) => m.cardById(c.id).damage || 0;

function play(seed, foeHp, script, policy) {
    let st = m.startFight({ seed, foe: { hp: foeHp, script } });
    let steps = 0;
    while (!st.over && steps < 400) {
        const incoming = m.intentDamage(st);
        if (policy === "reads" && incoming >= 12) {
            const blocker = st.hand.find((c) => blockOf(c) && m.canPlay(st, c.uid));
            if (blocker && st.hero.block < incoming) { st = m.playCard(st, blocker.uid).state; steps += 1; continue; }
        }
        const attacker = st.hand.find((c) => dmgOf(c) && m.canPlay(st, c.uid));
        if (attacker) { st = m.playCard(st, attacker.uid).state; steps += 1; continue; }
        st = m.endTurn(st).state; steps += 1;
    }
    return st;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => (i + 1) * 977);
const scriptAt = (a, b, c, blk) => [
    { key: "lunge", label: "Lunge", damage: a },
    { key: "guard", label: "Guarded Swing", damage: b, block: blk },
    { key: "heave", label: "Heave", damage: c },
];

console.log("hero 70 hp. 'dead' is how many of 40 seeds that policy loses.\n");
for (const [a, b, c] of [[11, 7, 16], [13, 8, 20], [14, 9, 26], [16, 10, 30]]) {
    for (const foeHp of [55, 60, 70]) {
        const script = scriptAt(a, b, c, 6);
        const rows = SEEDS.map((s) => [play(s, foeHp, script, "swings"), play(s, foeHp, script, "reads")]);
        const avg = (f) => rows.reduce((n, r) => n + f(r), 0) / rows.length;
        const dead = (i) => rows.filter((r) => r[i].over === "lose").length;
        console.log(
            `${String(a).padStart(2)}/${b}/${String(c).padStart(2)} vs ${foeHp} hp `
            + `| ${avg((r) => r[0].turn).toFixed(1)} turns `
            + `| swinger ${avg((r) => r[0].hero.hp).toFixed(0).padStart(2)}/70, ${String(dead(0)).padStart(2)} dead `
            + `| reader ${avg((r) => r[1].hero.hp).toFixed(0).padStart(2)}/70, ${String(dead(1)).padStart(2)} dead `
            + `| reading worth ${(avg((r) => r[1].hero.hp) - avg((r) => r[0].hero.hp)).toFixed(1)} hp`
        );
    }
    console.log("");
}
