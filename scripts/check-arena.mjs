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
const critChance = (cc) => Math.min(0.9, 0.25 + cc / 100);
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

function bout(kit, foe) {
    const mine = swing(kit.might) * ABILITY_EDGE
        * (1 + critChance(kit.cc) * (critMult(kit.cp) - 1)) * (1 - foe.armour);
    const theirs = foe.damage * (1 + foe.critChance * (foe.critMult - 1)) * (1 - GUARD_SHARE * BLOCK);
    const roundsIneed = foe.health / Math.max(0.1, mine);
    const roundsTheyNeed = health(kit.fero) / Math.max(0.1, theirs);
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
    const ok = rounds >= 6 && rounds <= 20;
    if (!ok) bad += 1;
    console.log(`  ${kit.name.padEnd(13)} tier ${String(best.t).padStart(3)}  ${String(rounds).padStart(2)} rounds  ${ok ? "ok" : "*** OUT OF THE 6-20 ROUND BAND ***"}`);
}

console.log("\nOne swing, so the card can be checked against the fight:");
for (const kit of KITS) {
    console.log(`  ${kit.name.padEnd(13)} damage ${swing(kit.might).toFixed(1).padStart(5)}   crit ${Math.round(critChance(kit.cc) * 100)}% x${critMult(kit.cp).toFixed(2)}   effective ${(swing(kit.might) * (1 + critChance(kit.cc) * (critMult(kit.cp) - 1))).toFixed(1)}`);
}

console.log(bad ? `\n${bad} cell(s) out of band.` : "\nEvery kit has a climbable ladder in the 6-20 round band.");
process.exit(bad ? 1 : 0);
