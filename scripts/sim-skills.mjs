// ── THE CAPSTONES, AGAINST REAL PEOPLE ───────────────────────────────────────────────────────────────────────
// Every balance number this feature had before now came from a fighter I typed by hand: no gear, no class, no
// passive tree, no badges, no pets. Combat reads four stat sources and badges alone outweigh all gear, so
// those numbers were measuring one quarter of a character and calling it the game.
//
// This pulls the real ones. kitFor is the function the Arena itself calls, imported rather than reimplemented,
// so a loadout here is assembled from base items, set bonuses, the compendium, forge enhancement, socketed
// gems, pets and badges exactly as it is in a live bout — that is what scripts/lib/app-loader.mjs exists for.
//
// The bouts are driven BEAT BY BEAT through arena-ring, the same two calls the routes make, with the defence
// picking its own skills off housePick. So this measures the fight members will actually play rather than the
// auto-resolver's version of it.
//
//   npm run sim:skills            every capstone, every member, against the field
//   npm run sim:skills 400        with a bigger sample per pairing
import { db } from "../src/lib/db.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { act, openRing, ringResult } from "../src/lib/marketplace/arena-ring.js";
import { SKILLS, housePick } from "../src/lib/marketplace/arena-skills.js";
import { CLASSES } from "../src/lib/marketplace/arena-classes.js";

const N = Number(process.argv[2]) || 160;


const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// One branch of one skill, run all the way to its capstone — the build the panel is designed to produce.
const capstoneBag = (skill, branchId) => ({
    [skill.id]: skill.nodes.filter((n) => n.branch === branchId).map((n) => n.id),
});

function play(me, foe, myBag, foeBag, seed) {
    const rng = mulberry(seed);
    let r = openRing(me, foe, { rng, foeSkills: foeBag });
    let guard = 0;
    while (!r.over && guard++ < 5000) {
        const ctx = {
            selfFrac: r.A.hp / Math.max(1, r.A.maxHp), foeFrac: r.B.hp / Math.max(1, r.B.maxHp),
            shield: r.A.shield, banked: r.A.banked, maxHp: r.A.maxHp,
            bleeding: r.A.bleedLeft > 0 || r.A.burnLeft > 0,
        };
        // Their beat resolves inside advance() now, so the loop only ever answers "act".
        r = act(r, { skill: housePick(myBag, r.cd, ctx), rng });
    }
    return { ...ringResult(r), ran: guard < 5000 };
}

// ── THE FIELD ────────────────────────────────────────────────────────────────────────────────────────────────
// Real members with a real arena presence, biggest first, capped so one run does not build fifty wardrobes.
const rows = await db.query(
    `SELECT a.buyer_id, b.display_name AS name, a.arena_class, a.arena_xp
       FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
      WHERE a.wins + a.losses > 0
      ORDER BY a.arena_xp DESC NULLS LAST
      LIMIT 8`
).catch(() => []);

if (!rows.length) {
    console.log("no members with arena history — nothing to measure against.");
    process.exit(0);
}

const fighters = [];
for (const r of rows) {
    const kit = await kitFor(r.buyer_id).catch(() => null);
    if (!kit) continue;
    fighters.push({ name: r.name || "(unnamed)", classId: r.arena_class, kit });
}

console.log(`${fighters.length} real loadouts, ${N} bouts a pairing\n`);
console.log("loadout                 class        gear   dmg    hp    armour");
for (const f of fighters) {
    console.log(
        String(f.name).slice(0, 22).padEnd(23),
        String(f.classId || "—").padEnd(12),
        String(Math.round(f.kit.gearPower || 0)).padStart(5),
        String(Math.round(f.kit.damage || 0)).padStart(6),
        String(Math.round(f.kit.health || 0)).padStart(6),
        String(Math.round(f.kit.armor || 0)).padStart(8)
    );
}

// ── EVERY CAPSTONE AGAINST THE WHOLE FIELD ───────────────────────────────────────────────────────────────────
// Each capstone build fights every OTHER loadout, on that loadout's own body, so a branch is measured by what
// it does rather than by whose gear happened to carry it.
console.log(`\ncapstone win rates against the field\n`);
console.log("class        skill        branch            win     beats   stalled");
const results = [];
for (const cls of CLASSES) {
    for (const skill of SKILLS.filter((s) => s.classId === cls.id)) {
        for (const br of skill.branches) {
            const bag = capstoneBag(skill, br.id);
            let wins = 0, runs = 0, beats = 0, stuck = 0;
            for (const me of fighters) {
                for (const foe of fighters) {
                    if (foe === me) continue;
                    for (let s = 1; s <= Math.max(1, Math.round(N / (fighters.length * (fighters.length - 1)))); s += 1) {
                        // The defence brings the SAME capstone, so a branch is not being flattered by
                        // fighting an empty deck — that was the flaw in the synthetic runs.
                        const r = play(me.kit, foe.kit, bag, bag, s * 7919 + runs);
                        runs += 1;
                        if (!r.ran) { stuck += 1; continue; }
                        if (r.won) wins += 1;
                        beats += r.beat;
                    }
                }
            }
            const win = runs ? wins / runs : 0;
            results.push({ cls: cls.id, skill: skill.name, br: br.name, win, beats: beats / Math.max(1, runs), stuck });
            console.log(
                cls.id.padEnd(12), skill.name.padEnd(12), br.name.padEnd(17),
                `${(win * 100).toFixed(0)}%`.padStart(5),
                (beats / Math.max(1, runs)).toFixed(0).padStart(8),
                String(stuck).padStart(9)
            );
        }
    }
}

// The number that matters: how far apart the best and worst branches are. Mirror matches should land near 50%,
// so anything far from it is a branch that wins or loses on identity rather than on play.
const sorted = [...results].sort((a, z) => z.win - a.win);
console.log(`\nspread: ${(sorted[0].win * 100).toFixed(0)}% (${sorted[0].skill}/${sorted[0].br})`
    + ` down to ${(sorted[sorted.length - 1].win * 100).toFixed(0)}% (${sorted[sorted.length - 1].skill}/${sorted[sorted.length - 1].br})`);
const off = results.filter((r) => Math.abs(r.win - 0.5) > 0.15).length;
console.log(`${off} of ${results.length} branches sit more than 15 points off an even fight.`);
const totalStuck = results.reduce((n, r) => n + r.stuck, 0);
console.log(totalStuck ? `\n${totalStuck} BOUTS NEVER ENDED` : "\nevery bout ended.");
process.exit(0);
