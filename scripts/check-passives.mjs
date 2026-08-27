// ── IS EVERY PASSIVE ACTUALLY WIRED? ─────────────────────────────────────────────────────────────────────────
// The recurring bug in this game is not a passive with the wrong number. It is a passive that reads beautifully
// on the card and does NOTHING — tenacity granted by pets that the accumulator silently dropped, ferocity wired
// to health and accuracy through a perk no class tree ever set, precision buying an accuracy that had been
// deleted. Every one of those was invisible to the build and to the type checker, because a stat nobody reads
// is not an error in any language.
//
// So this asks the only question that catches them, in two halves, for all thirty-six nodes:
//
//   1. DOES THE NODE REACH THE KIT?  kitFor is called with a synthetic skill tree — the same override the
//      arena itself uses — and the resulting fighter is compared field by field against an unspent one.
//      A node that changes nothing is not connected to the character.
//
//   2. DOES THE ENGINE CARE?  The changed fields are then pushed through autoBout against a fixed opponent
//      with a fixed seed. A node that changes the kit and not the fight is connected to a field nobody reads.
//
// A node has to pass BOTH. Run it after touching a tree, a stat or the engine.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-passives.mjs [member]
import { CLASSES, treeFor } from "../src/lib/marketplace/arena-classes.js";
// THE RING, NOT the old turn-based resolver. This used to measure through the second engine — the
// one nobody plays any more — so a node could read as idle because that resolver ignores it while
// the game pays it out every fight, or the reverse. autoRing drives the real openRing/act path.
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { db } from "../src/lib/db.js";

const WHO = process.argv[2] || "The Wolf Den";
const { kitFor } = await import("../src/lib/marketplace/arena.js");

const who = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!who) throw new Error(`no member called ${WHO}`);

// A deterministic rng so two runs of the same fighter are the same fight — otherwise "did the outcome change"
// is just noise.
// Nodes that only do something when another node is also taken. Measured as a pair, against that partner.
const NEEDS = {
    rv_deep: "rv_rend", rv_exsang: "rv_rend",              // deepen / drink a bleed
    wd_unbreak: "wd_bastion",                               // enlarge a guard
    rc_ember: "rc_kindle", rc_immolate: "rc_kindle",        // deepen / drink a burn
    rc_reservoir: "rc_ward",                                // refill a ward
};

const seeded = (n) => () => { n = (n * 1664525 + 1013904223) % 4294967296; return n / 4294967296; };

// THE SPARRING PARTNER IS SCALED TO THE FIGHTER. A fixed dummy is useless: against a real loadout it died on
// the first swing, so the fight was over before a stun, a haste or a bleed could ever matter and half the tree
// read as doing nothing. Built to trade evenly for roughly twenty-five swings instead, which is long enough
// for anything in a tree to show up.
// It also has to be WINNING. An opponent the fighter was never going to lose to makes every defensive node
// read as idle — more health changes nothing when you were not going to die, and the fight ends on the same
// swing either way. So the partner kills in about twelve swings while the unspent fighter needs twenty to
// answer: the baseline LOSES, and anything that keeps you alive or ends it sooner shows immediately.
// AND IT HAS TO GET THROUGH THE ARMOUR. Mitigation is FLAT, so a partner swinging for less than the fighter's
// armour deals literally 1 — the baseline took no damage at all and every defensive node in three trees read
// as doing nothing. The partner's blow is floored well above the armour it is walking into.
// ── ⚠️ AND IT HAS TO GET A TURN, WHICH UNDER THE RING IT DID NOT ─────────────────────────────────────────────
// Every note above was written against the old turn-based resolver, where turn order alternated and a partner
// with any damage at all was guaranteed to use it. The ring hands turns to whoever's BAR FILLS FIRST, and this
// partner had no tempo — so it defaulted to 1.0 against a real member's 1.9 and simply never acted.
//
// Measured with Luke's own kit: 24 fights, 24 wins, 268 swings, and ONE point of damage taken in total. The
// baseline was untouchable, so "anything that keeps you alive shows immediately" had nothing to show. That is
// the whole reason Exsanguinate, Immolate, Chill and Aether Ward reported idle — all four are defensive or
// sustain, all four move a real fight, and none of them can move one the fighter was never in danger of
// losing.
//
// So the partner is built to KEEP PACE now. Its bar runs as fast as the fighter's, which is what makes the
// twelve-swings-to-kill promise above true again rather than aspirational.
const sparringFor = (me) => ({
    // ── ⚠️ ARMOUR IS ADDED, NOT TRIPLED ──────────────────────────────────────────────────────────────────
    // The note above is right that a partner swinging for less than the fighter's armour deals literally 1.
    // `armor * 3` overshot it into absurdity: against a real tanky kit — armour 726, health 2,370 — it swung
    // for 2,178, which is a TWO-HIT KILL. "Kills in about twelve swings" was aspirational; nothing that heals,
    // shields or regenerates can matter when the whole fight is two blows, and that is the third and last
    // reason Exsanguinate kept reading as idle.
    //
    // Mitigation is flat, so the honest sizing is "get through the armour, THEN take a twelfth of the health":
    // armour + health/12 nets the twelve swings the comment promises, at any armour value.
    damage: Math.max(1, Math.round((Number(me.armor) || 0) + (Number(me.health) || 1000) / 12)),
    // Sized off what the fighter actually PUTS OUT per swing rather than off its damage stat: crits and
    // doublestrike roughly double it, so x20 was buying about ten swings, not twenty.
    health: Math.max(1, Math.round((Number(me.damage) || 100) * 40)),
    critChance: 0.15, critMult: 1.6, armor: 0, speed: 1,
    // THE LINE THAT WAS MISSING. Without it the partner is a spectator.
    tempo: Math.max(0.2, Number(me.tempo) || 1),
    pierce: 0, counter: 0, doublestrike: 0, lifesteal: 0, blockChance: 0.2, blockReduction: 0.35,
});

// What a fight LOOKS like, as one comparable fingerprint: who won, how long, and how much moved either way.
// ── ⚠️ AND IT COUNTS DAMAGE, NOT THE GAP BETWEEN FULL AND DEAD ───────────────────────────────────────────────
// `taken` used to be `maxHp - hp`, which SATURATES: a fighter who dies has taken exactly maxHp however much
// they healed on the way, so every point of sustain is arithmetically invisible in any fight they lose. The
// partner above is deliberately built to win, so that was every fight — which is why Exsanguinate read as
// idle for three passes running while the leech was working perfectly.
//
// Measured against the same node: at a difficulty the fighter survives, bleedLeech moves `taken` from 226,944
// to 209,430. One rung harder and both are 292,800 to the digit.
//
// Summed off the LOG instead, by the same rule the fight screen rebuilds its health bars with: a tick damages
// the fighter it is NAMED for, every other line damages the other side. That number does not saturate — heal
// through a beating and you go on to take MORE total damage, so sustain shows up as a bigger number rather
// than as no number at all.
function fingerprint(me, foe) {
    let dealt = 0, taken = 0, swings = 0, wins = 0, hpArea = 0;
    for (let s = 1; s <= 24; s += 1) {
        const r = autoRing(me, { ...foe }, { rng: seeded(s * 7919) });
        swings += r.swings;
        wins += r.won ? 1 : 0;
        for (const l of r.log || []) {
            if (Number.isFinite(Number(l?.meHp))) hpArea += Number(l.meHp);
            const d = Number(l?.dmg) || 0;
            if (!d) continue;
            if (l.bleedTick || l.burnTick) { if (l.who === "me") taken += d; else dealt += d; continue; }
            if (l.who === "me") dealt += d; else taken += d;
        }
    }
    // ── AND THE AREA UNDER THE HEALTH CURVE ──────────────────────────────────────────────────────────────
    // Damage sums catch anything that changes how a fight GOES. They still miss a small heal that changes
    // nothing about when somebody dies — Exsanguinate and Immolate are the same node twice, and which of the
    // two showed up came down to whether its heal happened to move a killing blow by one swing.
    //
    // Every line stamps `meHp`, so summing it is the area under the health curve: a fighter who drinks from a
    // wound is higher at every subsequent line whether or not they last a beat longer. It is the one term
    // here that measures SUSTAIN directly rather than inferring it from an outcome.
    return `${wins}|${swings}|${Math.round(dealt)}|${Math.round(taken)}|${Math.round(hpArea)}`;
}

const baseKit = await kitFor(who.id, { skillTree: {} });
// One partner for the whole run, built off the UNSPENT fighter, so every node is measured against the
// same opponent rather than one that grew with it.
const SPARRING = sparringFor(baseKit);

// ── ⚠️ ONE DIFFICULTY IS NOT ENOUGH, AND FOUR LIVE NODES PAID FOR THAT ───────────────────────────────────────
// The partner above is deliberately built to WIN, so anything that keeps you alive shows up. It does its job
// for mitigation and it is blind to SUSTAIN: against an opponent that kills you every single time, a node that
// heals you a share of a bleed tick moves the fight by less than the swing you die on, so `wins`, `swings`,
// `dealt` and `taken` all come back byte-identical and the node reads as idle.
//
// Exsanguinate, Immolate, Chill and Aether Ward were all reported dead by exactly that. Measured directly
// against a survivable opponent, every one of them moves the fight — Chill at 0.5 turns 0 wins in 40 into 34.
//
// So a node has to be invisible at BOTH ends to count as idle: an opponent you cannot beat, and one you can.
// A single verdict from a single difficulty is a coin toss about which half of the tree it can see.
const EASIER = { ...SPARRING, damage: Math.max(1, Math.round(SPARRING.damage * 0.55)) };
const fp2 = (kit) => `${fingerprint(kit, SPARRING)}#${fingerprint(kit, EASIER)}`;
const baseFp = fp2(baseKit);

let broken = 0;
let total = 0;
// One unspent baseline per class — see the note on `against` below.
const classBase = {};
for (const cls of CLASSES) classBase[cls.id] = fp2(await kitFor(who.id, { skillTree: {}, classId: cls.id }));

for (const cls of CLASSES) {
    console.log(`\n── ${cls.name.toUpperCase()} ${"─".repeat(56 - cls.name.length)}`);
    for (const node of treeFor(cls.id)) {
        total += 1;
        // A conditional node cannot show on its own — Emberheart needs a burn to deepen, Unbreakable needs a
        // guard to enlarge. Those are tested WITH the node they modify, and the pair is compared against that
        // partner alone rather than against nothing, so what is measured is still this node's own effect.
        const spend = { [node.id]: node.ranks };
        const partner = NEEDS[node.id];
        if (partner) spend[partner] = treeFor(cls.id).find((n) => n.id === partner).ranks;
        const kit = await kitFor(who.id, { skillTree: spend, classId: cls.id });
        const against = partner
            ? fp2(await kitFor(who.id, { skillTree: { [partner]: spend[partner] }, classId: cls.id }))
            // ⚠️ The SAME CLASS, spending nothing. This used to compare against the classless kit, so every
            // node was measured across a class change as well as its own effect — a Warden's DR, guard and
            // accuracy all move a fight before a point is spent. That confound is permissive, and it hid a
            // real fault: with thorns deliberately broken in the engine this still reported 36 of 36, because
            // switching to Warden had moved the fingerprint by itself.
            : classBase[cls.id];
        // 1. what did the node move on the character?
        const moved = [];
        for (const k of new Set([...Object.keys(baseKit), ...Object.keys(kit)])) {
            const a = baseKit[k];
            const b = kit[k];
            if (typeof a === "object" || typeof b === "object") continue;
            if (a !== b) moved.push(`${k} ${a}->${b}`);
        }
        // 2. did the fight change?
        const fp = fp2(kit);
        const fought = fp !== against;
        const ok = moved.length > 0 && fought;
        if (!ok) broken += 1;
        const mark = ok ? "ok  " : (moved.length === 0 ? "DEAD" : "IDLE");
        console.log(`  ${mark} ${node.name.padEnd(17)} ${node.stat.padEnd(20)} ${moved.length ? moved.join(", ") : "— nothing on the kit —"}`);
        if (moved.length && !fought) console.log(`       ^ reaches the kit and changes no fight: nothing in the engine reads it`);
    }
}
console.log(`\n${total - broken} of ${total} nodes are wired end to end.`);
if (broken) console.log(`${broken} need attention — DEAD means it never reaches the character, IDLE means the engine ignores it.`);
process.exit(0);
