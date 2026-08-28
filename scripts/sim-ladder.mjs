// ── THE LADDER, FOUGHT AGAINST ITSELF ────────────────────────────────────────────────────────────────────────
// ⚠️ THIS IS STILL A SIMULATION, AND SIMULATION LOST ITS ARGUMENT WITH REALITY ON 2026-08-28.
// The deleted check:classes fought three synthetic builds on identical gear and called Reaver 97%; this script
// called Reaver 30% and Runecaller 78%. The members' OWN bouts say Warden 66%, Runecaller 54%, Reaver 27%
// across 2,520 cross-class fights. All three disagree, and only one of them is made of things that happened.
// Read `node scripts/arena-report.mjs` FIRST and treat anything here as a hypothesis about a change you have
// not shipped yet — which is the one job real data cannot do.
//
// The original argument for this file still holds against the synthetic test it replaced: on the ladder nobody
// has identical gear. Luke: "I want you to simulate by using actual players base against each other, ideally
// the top 10 players."
//
// So: real members, real gear, real trees, real classes, real skill decks. Every pairing both ways on the same
// seeds, resolved by autoRing — the ring the game actually runs.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-ladder.mjs [n] [bouts]
import { db } from "../src/lib/db.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { skillsForClass } from "../src/lib/marketplace/arena-skills.js";

const N = Number(process.argv[2]) || 10;
const BOUTS = Number(process.argv[3]) || 200;
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

const top = await db.query(
    `SELECT a.buyer_id, a.vp, a.arena_class, b.display_name, b.alias, COALESCE(b.xp,0) AS xp
       FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
      WHERE COALESCE(b.xp,0) > 0
      ORDER BY a.vp DESC NULLS LAST LIMIT $1`, [N]);

const who = [];
for (const r of top) {
    const kit = await kitFor(r.buyer_id).catch(() => null);
    if (!kit) continue;
    const cls = r.arena_class || kit.classId || null;
    who.push({
        name: r.display_name || (r.alias ? "@" + r.alias : "Wolf"),
        vp: Number(r.vp) || 0, cls: cls || "none", kit,
        // Their own class's deck. housePick chooses from it each beat, the same way the ring does in play.
        skills: Object.fromEntries((cls ? skillsForClass(cls) : []).map((s) => [s.id, []])),
    });
}

console.log("");
console.log("  " + who.length + " members, " + BOUTS + " bouts a pairing, resolved by the ring. Real gear, real trees.");
console.log("");
console.log("  " + "member".padEnd(18) + "class".padEnd(12) + "vp".padStart(7) + "  dmg".padStart(7) + "  hp".padStart(7) + " armour".padStart(8) + " tempo".padStart(7) + " crit".padStart(6));
for (const w of who) {
    console.log("  " + w.name.slice(0, 17).padEnd(18) + String(w.cls).padEnd(12)
        + String(w.vp).padStart(7) + String(Math.round(w.kit.damage || 0)).padStart(7)
        + String(Math.round(w.kit.health || 0)).padStart(7) + String(Math.round(w.kit.armor || 0)).padStart(8)
        + (w.kit.tempo || 0).toFixed(2).padStart(7) + ((w.kit.critChance || 0) * 100).toFixed(0).padStart(5) + "%");
}

// Returns { p, first, second } — the win rate, and the two halves separately. If the halves disagree the
// sample is too small to quote, and at this scale that is the only thing worth checking: a matrix of numbers
// carries no error bars on its face, so it has to carry them somewhere.
const rate = (a, d) => {
    let w = 0; let firstW = 0;
    const half = Math.floor(BOUTS / 2);
    for (let s = 0; s < BOUTS; s += 1) {
        const r = autoRing({ ...who[a].kit }, { ...who[d].kit }, {
            rng: seeded(9091 + s * 7919), mySkills: who[a].skills, foeSkills: who[d].skills,
        });
        if (r.won) { w += 1; if (s < half) firstW += 1; }
    }
    return { p: w / BOUTS, first: half ? firstW / half : 0, second: (BOUTS - half) ? (w - firstW) / (BOUTS - half) : 0 };
};

console.log("");
console.log("  ── WIN RATE, ROW AGAINST COLUMN ──");
console.log("  " + "".padEnd(18) + who.map((w) => w.name.slice(0, 8).padStart(9)).join("") + "   average");
const avg = [];
const pairs = [];
let drift = 0;
for (let a = 0; a < who.length; a += 1) {
    const cells = [];
    let sum = 0; let n = 0;
    for (let d = 0; d < who.length; d += 1) {
        if (a === d) { cells.push("—".padStart(9)); continue; }
        const r = rate(a, d);
        sum += r.p; n += 1; pairs.push({ a, d, ...r });
        drift = Math.max(drift, Math.abs(r.first - r.second));
        cells.push((r.p * 100).toFixed(0).padStart(8) + "%");
    }
    avg[a] = n ? sum / n : 0;
    console.log("  " + who[a].name.slice(0, 17).padEnd(18) + cells.join("") + ((avg[a] * 100).toFixed(1) + "%").padStart(10));
}

console.log("");
console.log("  " + (pairs.length * BOUTS).toLocaleString() + " bouts across " + pairs.length + " ordered pairings.");
console.log("  Largest first-half vs second-half gap in any pairing: " + (drift * 100).toFixed(1) + " points"
    + (drift < 0.06 ? "  — converged." : "  — still moving; raise the bout count."));

// ── AND WHAT THE CLASSES DO WHEN THE GEAR IS REAL ────────────────────────────────────────────────────────────
const byClass = {};
for (const [i, w] of who.entries()) {
    (byClass[w.cls] ||= []).push({ name: w.name, win: avg[i] });
}
console.log("");
console.log("  ── BY CLASS, ON REAL GEAR ──");
for (const [cls, list] of Object.entries(byClass).sort((x, y) => {
    const m = (l) => l.reduce((s2, v) => s2 + v.win, 0) / l.length;
    return m(y[1]) - m(x[1]);
})) {
    const mean = list.reduce((s2, v) => s2 + v.win, 0) / list.length;
    const lo = Math.min(...list.map((v) => v.win));
    const hi = Math.max(...list.map((v) => v.win));
    console.log("  " + cls.padEnd(12) + list.length + " member" + (list.length === 1 ? " " : "s")
        + "  mean " + (mean * 100).toFixed(1).padStart(5) + "%"
        + "   spread " + (lo * 100).toFixed(0) + "%-" + (hi * 100).toFixed(0) + "%"
        + "   [" + list.map((v) => v.name.split(" ")[0]).join(", ") + "]");
}

console.log("");
const order = who.map((w, i) => ({ ...w, win: avg[i] })).sort((x, y) => y.win - x.win);
console.log("  ── STRENGTH vs LADDER POSITION ──");
console.log("  Does VP rank match who actually wins?");
console.log("");
for (const [i, w] of order.entries()) {
    const vpRank = who.slice().sort((x, y) => y.vp - x.vp).findIndex((x) => x.name === w.name) + 1;
    const drift = vpRank - (i + 1);
    const mark = drift === 0 ? "" : (drift > 0 ? "  (underrated by " + drift + ")" : "  (overrated by " + (-drift) + ")");
    console.log("  " + String(i + 1).padStart(2) + ". " + w.name.slice(0, 17).padEnd(18) + (w.win * 100).toFixed(1).padStart(6) + "%   vp rank " + vpRank + mark);
}
console.log("");
