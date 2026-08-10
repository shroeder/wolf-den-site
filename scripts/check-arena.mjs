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
const SWING_BASE = 12;
const swing = (might) => SWING_BASE * (1 + might / 100);
const critChance = (cc) => Math.min(0.9, 0.25 + cc / 100);
const critMult = (cp) => 2.5 + cp / 100;

const npcPower = (t) => Math.round(82 * Math.pow(1.045, Math.max(1, t) - 1));
const npc = (t) => {
    const p = npcPower(t);
    return {
        tier: t,
        health: Math.round(p * 2),
        damage: Math.round((8 + p * 0.07) * 10) / 10,
        armour: Math.min(0.45, Math.round((0.05 + t * 0.007) * 100) / 100),
        critChance: Math.min(0.5, Math.round((0.15 + t * 0.004) * 100) / 100),
        critMult: 2,
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
    const ok = rounds >= 7 && rounds <= 16;
    if (!ok) bad += 1;
    console.log(`  ${kit.name.padEnd(13)} tier ${String(best.t).padStart(3)}  ${String(rounds).padStart(2)} rounds  ${ok ? "ok" : "*** OUT OF THE 7-16 ROUND BAND ***"}`);
}

console.log("\nOne swing, so the card can be checked against the fight:");
for (const kit of KITS) {
    console.log(`  ${kit.name.padEnd(13)} damage ${swing(kit.might).toFixed(1).padStart(5)}   crit ${Math.round(critChance(kit.cc) * 100)}% x${critMult(kit.cp).toFixed(2)}   effective ${(swing(kit.might) * (1 + critChance(kit.cc) * (critMult(kit.cp) - 1))).toFixed(1)}`);
}

console.log(bad ? `\n${bad} cell(s) out of band.` : "\nEvery kit has a climbable ladder in the 7-16 round band.");
process.exit(bad ? 1 : 0);
