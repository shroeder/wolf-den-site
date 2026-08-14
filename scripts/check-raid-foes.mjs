// ── IS A TOWN RAIDER A FIGHT, OR AN EXECUTION? ───────────────────────────────────────────────────────────────
// The plaza's foes are fought on the arena engine (see town-swarm.js ARENA_SHAPE → arena.js startTownBout), so
// like the Gauntlet they are ARITHMETIC and can be checked rather than guessed at.
//
// This exists because they were not checked, and on 2026-08-13 a bandit raid one-shot the Den:
//
//     JT          "It keeps 1 shotting me from the jump"
//     Eric D      "First hit hits me for 1000 🤯 that's nutty"
//     GrayKitsune "its so fast and hits so hard I can't do anything"
//     Rumorleigh  "I tried one and he'd kill me the first blow"
//
// The cause was a UNIT MISMATCH, not a difficulty choice. ARENA_SHAPE's `power` figures were, by their own
// comment, "scaled off the kind's old HP" — the 18/26/44/70/260 hit points a foe had back when a raid was a
// tap-to-damage duel. Multiplied by ~10 those became 300/320/480/760/1900, and they were then spent as a GEAR
// POWER BUDGET, which is a different unit entirely: best-in-slot across all nine slots totals 644. So the
// rank-and-file "plain brawler, nothing fancy" was being built as a tier-34 Warlord, and the Lieutenant that
// killed everybody as a tier-47 Titan — against a Den whose best Gauntlet record is tier 27, held by one
// person. Nothing about it was reachable.
//
// The numbers below are duplicated from arena-kit.js / arena-npc.js on purpose — this is a SECOND OPINION, and
// a check that imports what it checks agrees with it by construction. If they drift apart that is the signal.
// (check-arena.mjs makes the same trade and has drifted on SWING_BASE; it says 8, the engine says 11.)
//
// Run:  node scripts/check-raid-foes.mjs
//       node scripts/check-raid-foes.mjs --old      what shipped, i.e. the raid that one-shot everyone

const OLD = process.argv.includes("--old");

// ── THE ENGINE, RESTATED ─────────────────────────────────────────────────────────────────────────────────────
const SWING_BASE = 11;                                    // arena-kit.js SWING_BASE
const health = (fero) => Math.round(200 + fero * 2.5);    // HEALTH_BASE + fero * HEALTH_PER_FEROCITY
const swing = (might) => SWING_BASE * (1 + might / 100);
const critChance = (cc) => Math.min(0.65, 0.25 + cc / 100);      // CRIT_BASE, CRIT_CAP
const critMult = (cp) => Math.min(3, 2.5 + cp / 100);            // CRIT_MULT_BASE, CRIT_MULT_CAP
const speedOf = (level, fero) => Math.round(10 + level * 0.3 + fero * 0.5);
const npcSpeed = (power) => Math.round(10 + power * 0.09);
const BLOCK = 0.34;          // what a member turns aside from every blow
const TOWN_EDGE = 2;         // a hero hits for double in the plaza (arena.js)
const npcPower = (t) => Math.round(34 * Math.pow(1.07, Math.max(1, t) - 1));
// The tier whose budget matches a raw power figure — how the old magic numbers get read back in tier terms.
const tierForPower = (p) => Math.max(1, Math.round(Math.log(p / 34) / Math.log(1.07) + 1));

const ARCH = {
    balanced: { w: [0.28, 0.16, 0.16, 0.40], tough: 1.11, guard: 0.22 },
    brute: { w: [0.44, 0.08, 0.12, 0.36], tough: 1.11, guard: 0.16 },
    wall: { w: [0.20, 0.10, 0.10, 0.60], tough: 1.35, guard: 0.30 },
    duelist: { w: [0.22, 0.24, 0.24, 0.30], tough: 1.14, guard: 0.20 },
    berserker: { w: [0.40, 0.18, 0.20, 0.22], tough: 1.06, guard: 0.12 },
};

// ── THE FOES ─────────────────────────────────────────────────────────────────────────────────────────────────
// Powers are stated as GAUNTLET TIERS, which is the whole point of the fix: "the Lieutenant is tier 14" is a
// claim you can check against where members actually are, and a raw 760 is not. Keep these in step with
// ARENA_SHAPE in town-swarm.js.
const FOES = OLD
    ? [
        { key: "scrapper", arch: "brute", power: 320, kitTier: 4 },
        { key: "archer", arch: "duelist", power: 300, kitTier: 5 },
        { key: "shieldbearer", arch: "wall", power: 480, kitTier: 6 },
        { key: "elite", arch: "berserker", power: 760, kitTier: 9 },
        { key: "chieftain", arch: "balanced", power: 1900, kitTier: 14 },
    ]
    : [
        { key: "scrapper", arch: "brute", tier: 6, kitTier: 4 },
        { key: "archer", arch: "duelist", tier: 7, kitTier: 5 },
        { key: "shieldbearer", arch: "wall", tier: 10, kitTier: 6 },
        { key: "elite", arch: "berserker", tier: 20, kitTier: 9 },
        { key: "chieftain", arch: "balanced", tier: 28, kitTier: 14 },
    ];

// ── THE RULE THAT KEEPS THIS FROM HAPPENING AGAIN ────────────────────────────────────────────────────────────
// No raid foe may take more than a THIRD of the weakest member's health in a single blow. That is the line the
// shipped numbers crossed — a Lieutenant's best move landed 286 on a 250-health member, so the fight was over
// before it started — and it is worth stating as a rule rather than re-deriving it from a complaint next time.
//
// A third leaves four blows of room at the very bottom of the gear ladder, which is enough to see the tell,
// spend a guard and swing back. It binds hardest on the archetypes that pour budget into offence, which is
// exactly where the failure was.
const SPIKE_SHARE_CAP = 1 / 3;

// Real loadouts, from items.js via check-arena.mjs: best-in-slot across nine slots is might 202 / cc 113 /
// cp 122 / fero 207. `level` only feeds speed (who swings first), which is half of what "one shot from the
// jump" actually means.
const KITS = [
    { name: "starting out", might: 20, cc: 10, cp: 10, fero: 20, level: 8 },
    { name: "half geared", might: 70, cc: 35, cp: 40, fero: 70, level: 25 },
    { name: "well geared", might: 130, cc: 70, cp: 75, fero: 135, level: 45 },
    { name: "best in slot", might: 202, cc: 113, cp: 122, fero: 207, level: 60 },
];

// The nastiest single blow a foe can throw: its hardest move, critting. This is the number that decides whether
// a fight is a fight or a coin flip you lose before acting — an average is no comfort to somebody who is dead.
// Berserkers bring `execute` (2.3) and everything else tops out around `spell` (2.1); scaled by kit tier the
// way npcAbilities does it.
const bigMove = (f) => (f.arch === "berserker" ? 2.3 : 2.1) * (1 + Math.min(0.6, f.kitTier * 0.006));
const ABILITY_EDGE = 1.25;   // a member lands an ability on cooldown — worth about this on average

function statsFor(f) {
    const a = ARCH[f.arch];
    const power = f.power ?? npcPower(f.tier);
    const [mi, cc, cp, fe] = a.w.map((x) => Math.round(power * x));
    return {
        power, tier: f.tier ?? tierForPower(power), arch: f.arch, guard: a.guard,
        health: Math.round(health(fe) * a.tough),
        damage: swing(mi), critChance: critChance(cc), critMult: critMult(cp),
        speed: npcSpeed(power),
        // Crit stats past the caps are budget poured down a drain — a tell that the budget is out of range.
        wastedCrit: cc > 65,
    };
}

console.log(OLD ? "── AS SHIPPED (the raid that one-shot everyone) ──" : "── RETUNED ──");
console.log();
for (const f of FOES) {
    const s = statsFor(f);
    const avg = s.damage * (1 + s.critChance * (s.critMult - 1));
    const spike = s.damage * bigMove(f) * s.critMult;
    console.log(`${f.key.toUpperCase().padEnd(14)} ${s.arch.padEnd(10)} power=${String(s.power).padStart(4)} (≈ Gauntlet tier ${String(s.tier).padStart(2)})  hp=${String(s.health).padStart(5)}  speed=${String(s.speed).padStart(3)}${s.wastedCrit ? "   ⚠ crit budget past the cap" : ""}`);
    console.log(`${"".padEnd(14)} hits for ${avg.toFixed(0)}/swing average, ${spike.toFixed(0)} on its best move critting`);
    for (const k of KITS) {
        const hp = health(k.fero);
        const mySpeed = speedOf(k.level, k.fero);
        // What actually reaches you, after the 34% every member turns aside.
        const incoming = avg * (1 - BLOCK);
        const spikeIn = spike * (1 - BLOCK);
        const myDmg = swing(k.might) * (1 + critChance(k.cc) * (critMult(k.cp) - 1)) * ABILITY_EDGE * TOWN_EDGE * (1 - s.guard);
        const roundsToKillIt = Math.ceil(s.health / myDmg);
        const roundsToKillMe = Math.ceil(hp / incoming);
        const first = mySpeed >= s.speed ? "you" : "IT";
        const oneShot = spikeIn >= hp;
        const twoShot = spikeIn * 2 >= hp;
        const verdict = oneShot ? "☠ ONE-SHOT" : twoShot ? "⚠ two blows" : roundsToKillIt <= roundsToKillMe ? "you win" : "you lose";
        console.log(`${"".padEnd(16)}${k.name.padEnd(14)} hp=${String(hp).padStart(4)}  you kill it in ${String(roundsToKillIt).padStart(2)}, it kills you in ${String(roundsToKillMe).padStart(2)}  first=${first.padEnd(3)}  ${verdict}`);
    }
    console.log();
}
// ── THE GATE ─────────────────────────────────────────────────────────────────────────────────────────────────
// Printed tables are only read when somebody is already suspicious, so the rule is enforced rather than shown.
// Exits non-zero, which is what makes this runnable from anything that cares.
const weakest = KITS[0];
const weakestHp = health(weakest.fero);
let failed = 0;
for (const f of FOES) {
    const s = statsFor(f);
    const spikeIn = s.damage * bigMove(f) * s.critMult * (1 - BLOCK);
    const share = spikeIn / weakestHp;
    if (share > SPIKE_SHARE_CAP) {
        console.log(`✗ ${f.key}: best move takes ${Math.round(share * 100)}% of a starting member's health in ONE blow (cap ${Math.round(SPIKE_SHARE_CAP * 100)}%)`);
        failed += 1;
    }
    if (s.speed > speedOf(KITS[2].level, KITS[2].fero)) {
        console.log(`✗ ${f.key}: out-speeds a well-geared member (${s.speed} vs ${speedOf(KITS[2].level, KITS[2].fero)}) — it swings first every time`);
        failed += 1;
    }
}
if (failed) {
    console.log(`\n${failed} problem(s). A raid is fought in whatever gear people had on when the horn went, not a loadout they tuned.`);
    process.exit(1);
}
console.log("✓ No foe one-shots the bottom of the gear ladder, and none out-speeds a geared member.");
