// ── COULD A MEMBER ACTUALLY BUILD THIS FIGHTER? ──────────────────────────────────────────────────────────────
// Luke: "there should be no fakeness to npc math, it should use the same constraints as players", then "they
// must comply with the players same constraints when it comes to passive points", then "only being able to
// select one path per skill yes?"
//
// Every one of those was true of some rungs and false of others at some point, and none of it was checked. A
// rung had a WARDEN tree and a RUNECALLER deck; it spent 41 passive points against a hard player ceiling of
// 24; and npcSkills counted no points at all. Reading the code says it is fixed. This says so about all 200.
//
// It validates a rung against the MEMBER's own rules, taken from the member's own constants and definitions —
// nothing is restated here, so retuning a cap moves this check with it.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-npc-legal.mjs
import { npcBuild, npcPointsFor, archetypeForTier } from "../src/lib/marketplace/arena-npc.js";
import { npcSkills, skillsForClass, skillPointsSpent, SKILL_POINT_CAP } from "../src/lib/marketplace/arena-skills.js";
// treeFor, not CLASSES[].nodes — the node list is assembled, and reading the raw field gives an
// empty array that makes every node look illegal. It is what npcTree itself spends against.
import { ARENA_MAX_LEVEL, treeFor } from "../src/lib/marketplace/arena-classes.js";
import { LADDER_MAX } from "../src/lib/marketplace/arena-ladder.js";
import { BUILDS_FOR_CHECK } from "../src/lib/marketplace/arena-npc-build.js";
import { STAT_META } from "../src/lib/marketplace/items.js";

const ALL = ["reaver", "warden", "runecaller"];
const fail = [];
const note = (t, msg) => fail.push(`rung ${t}: ${msg}`);

// ── EVERY REROLL TARGET IS A STAT THAT EXISTS ────────────────────────────────────────────────────────────────
// The fifteen builds name the stats they reroll toward by string. A typo moves real affix value onto a key
// nothing reads — it does not throw, it does not show up on a card, the fighter is simply weaker than its rung
// for ever. That is the exact failure this whole rework exists to end, and it was written down as a warning in
// arena-npc-build.js without anything actually checking it.
//
// STAT_META is where the game says what a stat is, which makes it the list to check against.
for (const [key, build] of Object.entries(BUILDS_FOR_CHECK)) {
    for (const stat of Object.keys(build.wants || {})) {
        if (!STAT_META[stat]) fail.push(`build ${key}: rerolls toward "${stat}", which is not a stat`);
    }
    if (!Object.keys(build.wants || {}).length) fail.push(`build ${key}: wants nothing`);
    if (!build.pet) fail.push(`build ${key}: has no companion`);
}

for (let t = 1; t <= LADDER_MAX; t += 1) {
    const b = npcBuild(t, 0);
    // The CLASS is handed in, exactly as every production caller hands it in — npcSkills' own fallback
    // derives a class from the archetype, and checking against the fallback rather than against what
    // the rung actually is would report a mismatch on every rung whose class was drawn.
    const deck = npcSkills(t, archetypeForTier(t).key, b.classId);
    const tree = treeFor(b.classId) || [];

    // ── ONE CLASS ── the tree it bought and the deck it brings must be the same class.
    for (const sid of Object.keys(deck)) {
        const owner = ALL.find((c) => skillsForClass(c).some((s) => s.id === sid));
        if (owner !== b.classId) note(t, `deck holds ${sid} (${owner}) but the tree is ${b.classId}`);
    }

    // ── PASSIVE POINTS ── a member earns one a level and level stops at ARENA_MAX_LEVEL.
    const spent = Object.values(b.taken || {}).reduce((a, n) => a + n, 0);
    if (spent > ARENA_MAX_LEVEL) note(t, `${spent} passive points, ceiling is ${ARENA_MAX_LEVEL}`);
    if (spent !== npcPointsFor(t)) note(t, `spent ${spent} but was allotted ${npcPointsFor(t)}`);
    // Rank caps and gates, the same two rules takeNode enforces.
    for (const [id, ranks] of Object.entries(b.taken || {})) {
        const n = tree.find((x) => x.id === id);
        if (!n) { note(t, `holds ${id}, which is not a ${b.classId} node`); continue; }
        if (ranks > n.ranks) note(t, `${id} at ${ranks} ranks, cap is ${n.ranks}`);
        if ((n.needs || 0) > 0 && spent < n.needs) note(t, `${id} needs ${n.needs} points, only ${spent} spent`);
    }

    // ── SKILL POINTS ── the cap, and ONE BRANCH PER SKILL with no gaps in it.
    const cost = skillPointsSpent(deck, b.classId);
    if (cost > SKILL_POINT_CAP) note(t, `${cost} skill points, cap is ${SKILL_POINT_CAP}`);
    for (const [sid, nodes] of Object.entries(deck)) {
        const def = skillsForClass(b.classId).find((s) => s.id === sid);
        if (!def) continue;
        const held = nodes.map((id) => def.nodes.find((n) => n.id === id)).filter(Boolean);
        const branches = new Set(held.map((n) => n.branch));
        if (branches.size > 1) note(t, `${sid} takes ${branches.size} paths: ${[...branches].join(", ")}`);
        // A branch is a ladder: everything above a held node in its own branch must be held too.
        for (const n of held) {
            const above = def.nodes.filter((x) => x.branch === n.branch && x.tier < n.tier);
            for (const a of above) if (!nodes.includes(a.id)) note(t, `${sid} holds ${n.id} without ${a.id}`);
        }
    }
}

const b100 = npcBuild(100, 0);
const d100 = npcSkills(100, archetypeForTier(100).key);
console.log(`\n  checked all ${LADDER_MAX} rungs against a member's own caps`);
console.log(`  passive ceiling ${ARENA_MAX_LEVEL} (arena level) · skill ceiling ${SKILL_POINT_CAP} · one path per skill`);
console.log(`  rung 100 for scale: ${b100.classId}, ${Object.values(b100.taken).reduce((a, n) => a + n, 0)} passive, ${skillPointsSpent(d100, b100.classId)} skill\n`);
if (fail.length) {
    console.log(`✗ ${fail.length} rungs could not be built by a member:`);
    for (const f of fail.slice(0, 20)) console.log("   " + f);
    process.exit(1);
}
console.log("  Every rung is a character a member could actually build.\n");
