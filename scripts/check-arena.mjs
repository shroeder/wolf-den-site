// ── IS THE ARENA A FAIR FIGHT? ───────────────────────────────────────────────────────────────────────────────
// The arena now reads real gear stats and rolls nothing but crit, which means a bout's length and its winner
// are ARITHMETIC. So they can be checked, and this checks them: for a grid of real loadouts against a grid of
// Gauntlet tiers, how many rounds does the fight run and who wins.
//
// The numbers here are duplicated from arena-kit.js / arena-npc.js deliberately — this is a second opinion,
// and a test that imports the thing it is testing agrees with it by construction. If they drift apart, that is
// the signal, not the bug.
//
// Run:  node scripts/check-arena.mjs

const health = (fero) => Math.round(200 + fero * 2.5);
const SWING_BASE = 8;
const swing = (might) => SWING_BASE * (1 + might / 100);
// Mirrors CRIT_CAP in arena-kit.js — 0.9 -> 0.65 when crit stopped being variance. This file is a
// deliberate second opinion and keeps its own copy; if the cap moves again, move it here too.
const critChance = (cc) => Math.min(0.65, 0.25 + cc / 100);
const critMult = (cp) => 2.5 + cp / 100;

const npcPower = (t) => Math.round(34 * Math.pow(1.07, Math.max(1, t) - 1));

// A Gauntlet fighter is a STAT BLOCK in the same shape a member's gear produces, spent according to its
// archetype — so "harder" is a different shape, not a bigger secret.
const ARCH = [
    { key: "balanced",  w: [0.28, 0.16, 0.16, 0.40], armour: 0.10 },
    { key: "brute",     w: [0.44, 0.08, 0.12, 0.36], armour: 0.10 },
    { key: "wall",      w: [0.20, 0.10, 0.10, 0.60], armour: 0.26 },
    { key: "duelist",   w: [0.22, 0.24, 0.24, 0.30], armour: 0.12 },
    { key: "berserker", w: [0.40, 0.18, 0.20, 0.22], armour: 0.06 },
];
const archFor = (t) => (t <= 3 ? ARCH[0] : ARCH[t % ARCH.length]);
const npc = (t) => {
    const a = archFor(t);
    const b = npcPower(t);
    const [mi, cc, cp, fe] = a.w.map((x) => Math.round(b * x));
    return {
        tier: t, key: a.key, armour: a.armour,
        health: health(fe),
        damage: swing(mi),
        critChance: critChance(cc),
        critMult: critMult(cp),
    };
};

// Real loadouts, from items.js: best-in-slot across nine slots totals might 202 / cc 113 / cp 122. These are
// fractions of that, which is what a member actually walks in with on the way up.
const KITS = [
    { name: "starting out", might: 20, cc: 10, cp: 10, fero: 20 },
    { name: "half geared", might: 70, cc: 35, cp: 40, fero: 70 },
    { name: "well geared", might: 130, cc: 70, cp: 75, fero: 135 },
    { name: "best in slot", might: 202, cc: 113, cp: 122, fero: 207 },
];

// Expected damage a round for each side. The player also plays a guard roughly a third of the time (turning
// aside 34%) and lands an ability on cooldown, which is worth about +25% on average — both folded in here so
// the model is the fight rather than two people swinging plainly.
const ABILITY_EDGE = 1.25;
const GUARD_SHARE = 0.33;
const BLOCK = 0.34;
// ── THE DEFENDER BRACES NOW ──────────────────────────────────────────────────────────────────────────────────
// Below a third of its health an absent defender covers up instead of swinging: your next blow lands on a
// raised guard (-40%) and it deals nothing that round. That cuts BOTH sides' damage, so it lengthens the tail
// of a fight — which is exactly the thing the two-minute promise cares about, and it has to be in the model or
// the model is measuring a game nobody plays.
//
// It only happens in the last third of the foe's health, and costs them a full attack, so it is folded in as a
// modest haircut on each side rather than a phase: roughly a tenth of the fight spent bracing.
// The defender is a real opponent now: it always plays a skill when one is off cooldown, it braces on rounds
// where it has nothing better rather than only when nearly dead, and it carries two poultices and a draught.
// That is a straight increase in how long it survives, and the model has to carry it or the two-minute promise
// is measured against a game nobody plays. A poultice is a quarter of its health, twice.
// Scaled by tier, like the real thing: nothing under 10, one poultice to 19, the full satchel above.
const foeItemHeal = (t) => (t < 10 ? 0 : t < 20 ? 0.25 : 0.5);
const BRACE_SHARE = 0.16;    // was 0.10 — it now also braces when its kit is cooling, not only when cornered
const MY_BRACE_LOSS = 1 - BRACE_SHARE * 0.4;   // their raised guard eating part of my swings
const THEIR_BRACE_LOSS = 1 - BRACE_SHARE;      // rounds they spend not swinging at all

// THE PIT CLOSES from round 7: every blow compounds, both ways. So "how many rounds" is no longer
// health/damage — it is how many rounds of a GROWING share of their health it takes, which is what actually
// bounds a fight. Solved by walking the rounds rather than dividing, because there is no closed form.
const PIT_AT = 7, PIT_STEP = 0.35;
const fever = (r) => (r < PIT_AT ? 1 : 1 + PIT_STEP * (r - PIT_AT + 1));
function roundsToKill(hp, perRound) {
    let left = hp;
    for (let r = 1; r <= 60; r += 1) { left -= perRound * fever(r); if (left <= 0) return r; }
    return 60;
}

function bout(kit, foe) {
    const mine = swing(kit.might) * ABILITY_EDGE
        * (1 + critChance(kit.cc) * (critMult(kit.cp) - 1)) * (1 - foe.armour) * MY_BRACE_LOSS;
    const theirs = foe.damage * (1 + foe.critChance * (foe.critMult - 1)) * (1 - GUARD_SHARE * BLOCK) * THEIR_BRACE_LOSS;
    const roundsIneed = roundsToKill(foe.health * (1 + foeItemHeal(foe.tier)), Math.max(0.1, mine));
    const roundsTheyNeed = roundsToKill(health(kit.fero), Math.max(0.1, theirs));
    return { mine, theirs, roundsIneed, roundsTheyNeed, win: roundsIneed <= roundsTheyNeed };
}

console.log("Rounds for YOU to win / rounds for THEM, and who gets there first.\n");
let bad = 0;
for (const kit of KITS) {
    const line = [];
    for (const t of [1, 5, 10, 16, 20, 27, 36, 50]) {
        const r = bout(kit, npc(t));
        line.push(`t${String(t).padStart(2)} ${r.roundsIneed.toFixed(0)}/${r.roundsTheyNeed.toFixed(0)}${r.win ? "W" : "L"}`);
    }
    console.log(`  ${kit.name.padEnd(13)} ${line.join("  ")}`);
}

console.log("\nThe fight you should be having — the hardest tier you still beat, and how long it runs:");
for (const kit of KITS) {
    let best = null;
    for (let t = 1; t < 200; t += 1) { const r = bout(kit, npc(t)); if (r.win) best = { t, r }; else break; }
    if (!best) { console.log(`  ${kit.name.padEnd(13)} beats NOTHING — the floor is too high`); bad += 1; continue; }
    const rounds = Math.round(best.r.roundsIneed);
    const ok = rounds >= 5 && rounds <= 13;
    if (!ok) bad += 1;
    console.log(`  ${kit.name.padEnd(13)} tier ${String(best.t).padStart(3)}  ${String(rounds).padStart(2)} rounds  ${ok ? "ok" : "*** OUT OF THE 5-13 ROUND BAND ***"}`);
}

console.log("\nOne swing, so the card can be checked against the fight:");
for (const kit of KITS) {
    console.log(`  ${kit.name.padEnd(13)} damage ${swing(kit.might).toFixed(1).padStart(5)}   crit ${Math.round(critChance(kit.cc) * 100)}% x${critMult(kit.cp).toFixed(2)}   effective ${(swing(kit.might) * (1 + critChance(kit.cc) * (critMult(kit.cp) - 1))).toFixed(1)}`);
}

// ── THE LONGEST FIGHT ANYONE CAN HAVE ────────────────────────────────────────────────────────────────────────
// The band above is the fight you are MEANT to pick. This is the one you can actually get into: any kit against
// any tier it might face, win or lose. A beat costs ~2.6s of animation before anybody has decided anything, so
// the ceiling that matters is wall-clock, not rounds. THIS is the assertion that keeps the promise.
const SECONDS_PER_ROUND = 4.2;
let worst = { rounds: 0 };
for (const kit of KITS) {
    for (let t = 1; t <= 70; t += 1) {
        const r = bout(kit, npc(t));
        const rounds = Math.min(r.roundsIneed, r.roundsTheyNeed);   // it ends when EITHER of them falls
        if (rounds > worst.rounds) worst = { rounds, kit: kit.name, tier: t, key: npc(t).key };
    }
}
const mins = (worst.rounds * SECONDS_PER_ROUND) / 60;
const capOk = mins <= 2;
if (!capOk) bad += 1;
console.log(`\nLongest fight reachable: ${worst.rounds} rounds - ${worst.kit} vs tier ${worst.tier} (${worst.key})`);
console.log(`  ~${mins.toFixed(1)} min at ${SECONDS_PER_ROUND}s a round  ${capOk ? "ok" : "*** OVER TWO MINUTES ***"}`);

console.log(bad ? `\n${bad} check(s) failed.` : "\nEvery kit has a climbable ladder, and no reachable fight runs over two minutes.");
process.exit(bad ? 1 : 0);
