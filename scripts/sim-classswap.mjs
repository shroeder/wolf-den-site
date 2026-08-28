// ── THE SAME PERSON, WEARING ANOTHER CLASS ───────────────────────────────────────────────────────────────────
// Luke: "take jt and simulate his same character but have in mirror my class then have me and him fight and
// see who wins."
//
// This is the only question the ladder cannot answer on its own. No two members share a kit — across four of
// them, thirty-two stats differ — so "Runecaller beats Warden" and "Eric has better gear than Nicholas" are
// the same number and there is no way to tell them apart. Holding ONE member fixed and changing ONLY the class
// separates them.
//
// ⚠️ THE RESPEND IS THE CATCH, AND IT NEEDS A CONTROL.
// treeEffects() looks nodes up by id inside the class's own tree, so handing a Warden's allocation to the
// Runecaller tree matches nothing and silently zeroes his tree. That is not a class swap, it is stripping him.
// So his points get respent — and a respend is an invented build, which is exactly what made the deleted
// check:classes worthless.
//
// The control is the third fighter: the same member, respent into his OWN class by the same algorithm. If that
// does not reproduce his real result, the algorithm is doing the work and the swap proves nothing. Read that
// row first. Everything below it is only meaningful if it holds.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-classswap.mjs "JT" "The Wolf Den" [bouts]
import { db } from "../src/lib/db.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { skillsForClass } from "../src/lib/marketplace/arena-skills.js";
import { CLASSES, treeFor } from "../src/lib/marketplace/arena-classes.js";

const SUBJECT = process.argv[2] || "JT";
const OPPONENT = process.argv[3] || "The Wolf Den";
const BOUTS = Number(process.argv[4]) || 600;
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

const find = async (name) => {
    const r = await db.queryOne(
        `SELECT a.buyer_id, a.arena_class, a.skill_tree, COALESCE(b.display_name, b.alias) AS name
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
          WHERE LOWER(COALESCE(b.display_name, b.alias)) LIKE LOWER($1) ORDER BY a.vp DESC NULLS LAST LIMIT 1`,
        [`%${name}%`]);
    if (!r) { console.error(`sim-classswap: nobody matches "${name}"`); process.exit(1); }
    return r;
};

const subj = await find(SUBJECT);
const opp = await find(OPPONENT);
const points = Object.values(subj.skill_tree || {}).reduce((a, b) => a + (Number(b) || 0), 0);

// Spend his real point total down a tree in tier order — the way somebody levelling actually spends, and the
// only allocation that needs no opinion about what he "would" pick.
const spend = (clsId, budget) => {
    const take = {};
    let left = budget;
    for (const n of treeFor(clsId)) {
        if (left <= 0) break;
        const put = Math.min(n.ranks, left);
        take[n.id] = put;
        left -= put;
    }
    return take;
};

const deck = (cls) => Object.fromEntries(skillsForClass(cls || "").map((s) => [s.id, []]));

// Everything about him except the class and the allocation is untouched: real gear, real badges, real pets.
const build = async (label, classId, tree) => ({
    label,
    cls: classId,
    kit: await kitFor(subj.buyer_id, tree === null ? { classId } : { classId, skillTree: tree }),
    skills: deck(classId),
});

const oppKit = await kitFor(opp.buyer_id);
const oppSkills = deck(opp.arena_class);

const fighters = [
    await build(`${subj.name} — as he is (${subj.arena_class})`, subj.arena_class, null),
    await build(`${subj.name} — respent into ${subj.arena_class} [CONTROL]`, subj.arena_class, spend(subj.arena_class, points)),
    ...(await Promise.all(CLASSES.filter((c) => c.id !== subj.arena_class)
        .map((c) => build(`${subj.name} — as a ${c.name}`, c.id, spend(c.id, points))))),
];

const rate = (kit, skills) => {
    let w = 0;
    for (let s = 0; s < BOUTS; s += 1) {
        // Same seeds for every variant, so the four rows differ by the fighter and nothing else.
        if (autoRing({ ...kit }, { ...oppKit }, { rng: seeded(4241 + s * 7919), mySkills: skills, foeSkills: oppSkills }).won) w += 1;
    }
    return w / BOUTS;
};

console.log(`\n  ${subj.name} (${points} tree points) vs ${opp.name} (${opp.arena_class}), ${BOUTS} bouts each, real gear both sides.\n`);

// Columns derived, never chosen — a hand-written list is how bleed went missing from the ladder table.
const kits = fighters.map((f) => f.kit);
const HEAD = ["damage", "health", "armor", "tempo"];
const varying = [...new Set(kits.flatMap((k) => Object.keys(k)))]
    .filter((k) => !HEAD.includes(k))
    .filter((k) => kits.every((x) => x[k] === undefined || typeof x[k] === "number"))
    .filter((k) => new Set(kits.map((x) => Number(x[k]) || 0)).size > 1).sort();
const fmt = (v) => (Math.abs(v) > 0 && Math.abs(v) < 1 ? `${(v * 100).toFixed(0)}%` : String(Math.round(v * 100) / 100));
const W = (k) => Math.max(k.length, 5) + 2;

console.log("  " + "fighter".padEnd(42) + "win%".padStart(7)
    + HEAD.map((k) => k.padStart(8)).join("") + varying.map((k) => k.padStart(W(k))).join(""));
for (const f of fighters) {
    const p = rate(f.kit, f.skills);
    console.log("  " + f.label.slice(0, 41).padEnd(42) + `${(p * 100).toFixed(1)}%`.padStart(7)
        + HEAD.map((k) => (k === "tempo" ? (f.kit[k] || 0).toFixed(2) : String(Math.round(f.kit[k] || 0))).padStart(8)).join("")
        + varying.map((k) => fmt(Number(f.kit[k]) || 0).padStart(W(k))).join(""));
}
console.log(`\n  ${varying.length} stats differ between these builds; every one is shown.`);
console.log("  Read the CONTROL row first: if respending into his own class does not reproduce his real");
console.log("  result, the respend is doing the work and the class swap below it proves nothing.\n");
