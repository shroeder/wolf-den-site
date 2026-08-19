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
import { autoBout } from "../src/lib/marketplace/arena-engine.js";
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
const sparringFor = (me) => ({
    damage: Math.max(1, Math.round(Math.max((Number(me.health) || 1000) / 12, (Number(me.armor) || 0) * 3))),
    health: Math.max(1, Math.round((Number(me.damage) || 100) * 20)),
    critChance: 0.15, critMult: 1.6, armor: 0, speed: 1,
    pierce: 0, counter: 0, doublestrike: 0, lifesteal: 0, blockChance: 0.2, blockReduction: 0.35,
});

// What a fight LOOKS like, as one comparable fingerprint: who won, how long, and how much moved either way.
function fingerprint(me, foe) {
    let dealt = 0, taken = 0, swings = 0, wins = 0;
    for (let s = 1; s <= 24; s += 1) {
        const r = autoBout(me, { ...foe }, { rng: seeded(s * 7919) });
        swings += r.swings;
        wins += r.won ? 1 : 0;
        dealt += (r.foeMaxHp - r.foeHp);
        taken += (r.maxHp - r.hp);
    }
    return `${wins}|${swings}|${Math.round(dealt)}|${Math.round(taken)}`;
}

const baseKit = await kitFor(who.id, { skillTree: {} });
// One partner for the whole run, built off the UNSPENT fighter, so every node is measured against the
// same opponent rather than one that grew with it.
const SPARRING = sparringFor(baseKit);
const baseFp = fingerprint(baseKit, SPARRING);

let broken = 0;
let total = 0;
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
            ? fingerprint(await kitFor(who.id, { skillTree: { [partner]: spend[partner] }, classId: cls.id }), SPARRING)
            : baseFp;
        // 1. what did the node move on the character?
        const moved = [];
        for (const k of new Set([...Object.keys(baseKit), ...Object.keys(kit)])) {
            const a = baseKit[k];
            const b = kit[k];
            if (typeof a === "object" || typeof b === "object") continue;
            if (a !== b) moved.push(`${k} ${a}->${b}`);
        }
        // 2. did the fight change?
        const fp = fingerprint(kit, SPARRING);
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
