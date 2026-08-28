// ── ARE THE THREE CLASSES EVEN? ──────────────────────────────────────────────────────────────────────────────
// Luke, after freeze was made class-scaled and chill was uncapped: "take a look at balance between classes
// because it sounds like the Runecaller is overpowered compared to everyone else because of its ability to
// freeze and chill."
//
// A round robin on IDENTICAL gear. Every fighter gets the same base stats and the same number of tree points,
// spent down their own class's tree in tier order, so the only thing that differs is the class — which is the
// only way to answer "is one of them stronger" rather than "is one member better geared".
//
// It resolves with autoRing, the real ring, because that is the whole lesson of the week: a projection made in
// a resolver nobody plays is a number about a different game.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-class-balance.mjs [points] [bouts]
//
// ── WHAT A HEALTHY NUMBER LOOKS LIKE ─────────────────────────────────────────────────────────────────────────
// Not 50% everywhere — a rock-paper-scissors edge between two classes is a design, not a fault. What must not
// happen is one class beating BOTH of the others, because then there is no reason for anybody to pick a third
// of the tree. The pass mark is on the average across a class's matchups, not on any single pairing.
import { CLASSES, treeFor } from "../src/lib/marketplace/arena-classes.js";
import { fighterFrom } from "../src/lib/marketplace/arena.js";
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { skillsForClass } from "../src/lib/marketplace/arena-skills.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { db } from "../src/lib/db.js";

const POINTS = Number(process.argv[2]) || 25;
const BOUTS = Number(process.argv[3]) || 400;
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// One real member's gear for all three, so the numbers are about a fight somebody could actually have.
const who = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = 'The Wolf Den'`);
const gear = await kitFor(who.id, { skillTree: {} });

// Points spent down the tree in tier order — the way somebody levelling actually spends them.
function spendTree(clsId, points) {
    const take = {};
    let left = points;
    for (const n of treeFor(clsId)) {
        if (left <= 0) break;
        const put = Math.min(n.ranks, left);
        take[n.id] = put;
        left -= put;
    }
    return take;
}

const built = {};
for (const cls of CLASSES) {
    built[cls.id] = {
        name: cls.name,
        kit: await kitFor(who.id, { skillTree: spendTree(cls.id, POINTS), classId: cls.id }),
        skills: Object.fromEntries(skillsForClass(cls.id).map((s) => [s.id, []])),
    };
}

console.log(`\n  ${POINTS} tree points each, identical gear, ${BOUTS} bouts a pairing, resolved by the ring.\n`);
for (const c of CLASSES) {
    const b = built[c.id];
    console.log(`  ${b.name.padEnd(11)} tempo ${(b.kit.tempo || 0).toFixed(2)}  dmg ${Math.round(b.kit.damage)}  hp ${b.kit.health}`
        + `  armour ${b.kit.armor}  freeze ${((b.kit.freeze || 0) * 100).toFixed(0)}%  chill ${((b.kit.chill || 0) * 100).toFixed(0)}%`);
}

const rate = (a, d) => {
    let w = 0;
    for (let s = 0; s < BOUTS; s += 1) {
        // The same seed for both directions of a pairing, so a coin flip at the bell cannot flatter one side.
        const r = autoRing({ ...built[a].kit }, { ...built[d].kit }, {
            rng: seeded(7717 + s * 7919), mySkills: built[a].skills, foeSkills: built[d].skills,
        });
        if (r.won) w += 1;
    }
    return w / BOUTS;
};

console.log(`\n  ── WIN RATE, ROW AGAINST COLUMN ──`);
console.log(`  ${"".padEnd(13)}${CLASSES.map((c) => c.name.padStart(12)).join("")}      average`);
const avg = {};
for (const a of CLASSES) {
    const cells = [];
    let sum = 0;
    let n = 0;
    for (const d of CLASSES) {
        if (a.id === d.id) { cells.push("—".padStart(12)); continue; }
        const p = rate(a.id, d.id);
        sum += p; n += 1;
        cells.push(`${(p * 100).toFixed(1)}%`.padStart(12));
    }
    avg[a.id] = n ? sum / n : 0;
    console.log(`  ${a.name.padEnd(13)}${cells.join("")}${`${(avg[a.id] * 100).toFixed(1)}%`.padStart(13)}`);
}

// ── AND HOW MUCH OF IT IS THE ICE ────────────────────────────────────────────────────────────────────────────
// The specific question. Re-run the Runecaller with its two control stats stripped and nothing else changed,
// so what is left is the difference freeze and chill are actually making.
const rc = CLASSES.find((c) => c.id === "runecaller");
if (rc) {
    const cold = built[rc.id].kit;
    built[rc.id].kit = { ...cold, freeze: 0, chill: 0 };
    let sum = 0; let n = 0;
    for (const d of CLASSES) { if (d.id === rc.id) continue; sum += rate(rc.id, d.id); n += 1; }
    built[rc.id].kit = cold;
    console.log(`\n  Runecaller with freeze and chill set to zero: ${(sum / n * 100).toFixed(1)}% average`
        + `  (the ice is worth ${((avg[rc.id] - sum / n) * 100).toFixed(1)} points)`);
}

// The same isolation for the Reaver's own signature — Quickblade, five ranks of it. That used to be the BAR
// REFUND and this test zeroed `extra`; the refund is gone and every point of it became TEMPO, so zeroing
// `extra` measured nothing and dutifully reported "worth 0.0 points". A probe that cannot fail is worse than
// no probe. It strips the tempo Quickblade and Frenzy pay for instead — 0.027 and 0.009 a rank.
const rv = CLASSES.find((c) => c.id === "reaver");
if (rv) {
    const fast = built[rv.id].kit;
    // Quickblade x5 (0.027) plus Frenzy x5 (0.009) is 0.18 of tempo at full investment; at 25 points spent
    // tier-first only Quickblade is reached, so this removes what those ranks actually bought.
    built[rv.id].kit = { ...fast, tempo: Math.max(0.2, (fast.tempo || 1) - 0.135) };
    let sum = 0; let n = 0;
    for (const d of CLASSES) { if (d.id === rv.id) continue; sum += rate(rv.id, d.id); n += 1; }
    built[rv.id].kit = fast;
    console.log(`  Reaver without Quickblade's tempo:         ${(sum / n * 100).toFixed(1)}% average`
        + `  (that tempo is worth ${((avg[rv.id] - sum / n) * 100).toFixed(1)} points)`);
}

const spread = Math.max(...Object.values(avg)) - Math.min(...Object.values(avg));
const worst = CLASSES.find((c) => avg[c.id] === Math.max(...Object.values(avg)));
// A class that beats BOTH others is the failure. 60% average is the line: above it, one class is the answer.
if (avg[worst.id] > 0.6) {
    console.log(`\ncheck:classes — ${worst.name} averages ${(avg[worst.id] * 100).toFixed(1)}% against the other two. One class should not be the answer.`);
    process.exit(1);
}
console.log(`\ncheck:classes — spread ${(spread * 100).toFixed(1)} points, nobody above 60%. No class is simply the pick.`);
