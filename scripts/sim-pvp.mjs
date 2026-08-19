// ── THE DAILY FIELD, A THOUSAND BOUTS ────────────────────────────────────────────────────────────────────────
// Combat was rewritten from the ground up and then tuned one pairing at a time: a mirror match, a dummy, a
// scaled sparring partner. Every one of those answers a question about a FIGHTER. None answers the question the
// members are asking, which is whether the ring rewards what you built or what you happen to be wearing.
//
// WHOSE RING. Not everybody's. A field averaged over every account that ever signed up is a field of people who
// are not here — half of them last logged in weeks ago, wearing whatever they were handed on day one, and their
// numbers drag every average toward a player who does not exist. The ring is balanced for the people who turn
// up, so the field is the people who turn up: everyone who has played at least DAYS_REQUIRED of the last
// FOURTEEN days, fighting in the gear they have equipped RIGHT NOW.
//
// So: their real wardrobes, their real pets, badges and compendium, crossed with the ten-point allocations they
// could actually spend, and a thousand pairings between them run both ways.
//
// It runs the real code. `fighterFrom` is the same function kitFor spreads to build a member for a live bout,
// and `autoBout` is the resolver the Arena calls. A sim that re-implements either measures a game nobody is
// playing, which is exactly how the Long Road shipped mis-measured.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-pvp.mjs [pairings=1000] [seed=7] [days=12]
import { CLASSES, treeFor, treeEffects } from "../src/lib/marketplace/arena-classes.js";
import { fighterFrom, combatStats } from "../src/lib/marketplace/arena.js";
import { autoBout } from "../src/lib/marketplace/arena-engine.js";
import { getEquippedStats, getEquippedIds } from "../src/lib/marketplace/inventory.js";
import { db } from "../src/lib/db.js";

const FIGHTS = Number(process.argv[2]) || 1000;
const SEED = Number(process.argv[3]) || 7;
const DAYS_REQUIRED = Number(process.argv[4]) || 12;   // of the last fourteen
const CHARACTERS = 100;
const POINTS = 10;

// One generator for the whole run, so the field and the fights are reproducible together.
let _s = SEED >>> 0;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };

// ── WHO PLAYS ────────────────────────────────────────────────────────────────────────────────────────────────
// Distinct days with any activity at all in the last fortnight. Not `last_seen_at`, which one visit sets and
// which would count somebody who looked in once three days ago as a regular.
const daily = await db.query(`
    SELECT b.id, b.display_name, b.login_streak,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) AS days
      FROM mkt_buyer b
      JOIN mkt_activity_event e ON e.buyer_id = b.id
     WHERE e.created_at > NOW() - INTERVAL '14 days' AND b.display_name IS NOT NULL
     GROUP BY b.id, b.display_name, b.login_streak
    HAVING COUNT(DISTINCT (e.created_at AT TIME ZONE 'America/Chicago')::date) >= $1
     ORDER BY days DESC, b.display_name ASC`, [DAYS_REQUIRED]);

// ── WHAT THEY ARE WEARING ────────────────────────────────────────────────────────────────────────────────────
// getEquippedStats is what the boss and the Arena already fight them with — base, set bonuses, forge levels and
// socketed jewels, merged. combatStats then folds in the other three sources the ring reads. Done ONCE per
// member; the ten-point builds below are just a different perk bag over the same body.
const members = [];
for (const m of daily) {
    const bySlot = await getEquippedIds(m.id).catch(() => ({}));
    const ids = Object.values(bySlot || {}).filter(Boolean);
    if (!ids.length) continue;                       // nothing equipped: not a fighter, however often they log in
    const gear = await getEquippedStats(m.id).catch(() => ({}));
    const stats = await combatStats(m.id, gear, ids).catch(() => null);
    if (!stats) continue;
    members.push({ id: m.id, who: m.display_name, days: Number(m.days), streak: Number(m.login_streak) || 0, stats, slots: ids.length });
}
if (!members.length) throw new Error("nobody in the field — is DATABASE_URL set?");

// ── THE TEN BUILDS ───────────────────────────────────────────────────────────────────────────────────────────
// Ten points is what a real member has to spend, and how they spend it is the only decision the tree offers.
// These are the shapes people actually reach for, not random allocations: pour everything into one node, take
// the cheapest three, rush a gate, spread thin. A purely random spread measures the AVERAGE build, and nobody
// plays the average build — they play the one somebody told them was best.
const OFFENCE = new Set(["crit", "critMult", "critStat", "critPower", "dmgPct", "speed", "might",
    "bleedChance", "bleedDamage", "burnChance", "burnDamage", "doublestrikeBonus", "stunBonus",
    "hasteBonus", "pierceStat", "surge", "soulfire", "cataclysm"]);
const DEFENCE = new Set(["health", "healthPct", "armorPct", "guardChance", "guardSize", "regen", "thorns",
    "ward", "wardRefill", "iceThorns", "chill", "freeze", "blockChance", "blockReductionBonus",
    "lifestealStat", "lifesteal", "lifestealBonus", "grudge", "bleedLeech", "burnLeech"]);

// Points go in ONE AT A TIME, respecting each node's rank ceiling and its gate, because that is the only way the
// tree can actually be spent. A build that "takes" a tier-3 node it has not unlocked is not a build.
function spend(tree, wanted, points) {
    const taken = {};
    const total = () => Object.values(taken).reduce((a, n) => a + n, 0);
    const list = (wanted || []).filter(Boolean);
    let guard = 0;
    while (total() < points && guard < 400) {
        guard += 1;
        let placed = false;
        for (const n of list) {
            if (total() >= points) break;
            if ((taken[n.id] || 0) >= n.ranks) continue;
            if (total() < (n.needs || 0)) continue;     // the gate
            taken[n.id] = (taken[n.id] || 0) + 1;
            placed = true;
        }
        // Nothing wanted can take another point — fall back to anything legal, which is what a member does when
        // their plan runs out of ranks before it runs out of points.
        if (!placed) {
            const any = tree.find((n) => (taken[n.id] || 0) < n.ranks && total() >= (n.needs || 0));
            if (!any) break;
            taken[any.id] = (taken[any.id] || 0) + 1;
        }
    }
    return taken;
}

const STRATEGIES = [
    { id: "one-deep", how: (t) => spend(t, [t[0]], POINTS) },
    { id: "two-deep", how: (t) => spend(t, t.slice(0, 2), POINTS) },
    { id: "tier0-wide", how: (t) => spend(t, t.filter((n) => n.tier === 0), POINTS) },
    { id: "rush-t1", how: (t) => spend(t, [t.filter((n) => n.tier === 0)[0], ...t.filter((n) => n.tier === 1)], POINTS) },
    { id: "rush-t2", how: (t) => spend(t, [...t.filter((n) => n.tier === 0).slice(0, 2), ...t.filter((n) => n.tier === 2)], POINTS) },
    { id: "capstone", how: (t) => spend(t, [...t.filter((n) => n.tier < 3).slice(0, 3), ...t.filter((n) => n.tier === 3)], POINTS) },
    { id: "offence", how: (t) => spend(t, t.filter((n) => OFFENCE.has(n.stat)), POINTS) },
    { id: "defence", how: (t) => spend(t, t.filter((n) => DEFENCE.has(n.stat)), POINTS) },
    { id: "spread", how: (t) => spend(t, t, POINTS) },
    { id: "shuffled", how: (t) => spend(t, [...t].sort(() => rnd() - 0.5), POINTS) },
];

// A hundred characters over however many members turned up: every member gets builds, cycling class and shape
// so no member is only ever seen as one class and no shape is only ever seen on one wardrobe.
//
// THE CLASS COUNTS HAVE TO COME OUT EVEN. Walking the member list with `i % members.length` while taking the
// class from the same `i` correlates the two whenever the counts share a factor — twenty-one members and three
// classes gave 42/37/21, and a class with half the characters of another cannot be compared to it. The member
// index walks one extra step each pass instead, which decorrelates it from the class cycle.
const field = [];
for (let i = 0; i < CHARACTERS; i += 1) {
    const L = members.length;
    const m = members[((i % L) + Math.floor(i / L)) % L];
    const cls = CLASSES[i % CLASSES.length];
    const strat = STRATEGIES[i % STRATEGIES.length];
    const taken = strat.how(treeFor(cls.id));
    const fighter = fighterFrom(m.stats, treeEffects(cls.id, taken), cls.id);
    field.push({
        id: `c${String(i + 1).padStart(3, "0")}`, who: m.who, days: m.days, streak: m.streak,
        cls: cls.id, clsName: cls.name, strat: strat.id, taken,
        spent: Object.values(taken).reduce((a, x) => a + x, 0), fighter,
        sheet: {
            dmg: Math.round(fighter.damage), hp: fighter.health, armor: fighter.armor,
            spd: Number(fighter.speed.toFixed(2)), crit: Math.round(fighter.critChance * 100),
        },
        w: 0, l: 0, draw: 0, bouts: 0,
    });
}

// ── THE TOURNAMENT ───────────────────────────────────────────────────────────────────────────────────────────
// Random pairings across the field, which is what the Arena's own matchmaking produces — you challenge who is
// there, not who is your size. Each pairing runs BOTH WAYS off the same seed and both results count, so whatever
// advantage the engine gives the fighter passed in first cancels instead of becoming half of someone's win rate.
let unresolved = 0;
let swingSum = 0;
let bouts = 0;
for (let f = 0; f < FIGHTS; f += 1) {
    const a = field[Math.floor(rnd() * field.length)];
    let b = field[Math.floor(rnd() * field.length)];
    while (b === a) b = field[Math.floor(rnd() * field.length)];
    const seed = Math.floor(rnd() * 4294967296);
    const mk = () => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    for (const [me, foe] of [[a, b], [b, a]]) {
        const r = autoBout({ ...me.fighter }, { ...foe.fighter }, { rng: mk() });
        bouts += 1;
        swingSum += r.swings;
        me.bouts += 1;
        foe.bouts += 1;
        if (r.unresolved) { unresolved += 1; me.draw += 1; foe.draw += 1; }
        else if (r.won) { me.w += 1; foe.l += 1; }
        else { me.l += 1; foe.w += 1; }
    }
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const rate = (c) => (c.bouts ? c.w / c.bouts : 0);
const group = (key) => {
    const g = {};
    for (const c of field) {
        const k = c[key];
        g[k] ||= { w: 0, bouts: 0, n: 0 };
        g[k].w += c.w; g[k].bouts += c.bouts; g[k].n += 1;
    }
    return g;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`\n${field.length} characters built from ${members.length} members who played ${DAYS_REQUIRED}+ of the last 14 days`);
console.log(`in the gear they have equipped right now · ${POINTS} points each · ${bouts} bouts · seed ${SEED}\n`);

console.log("── BY CLASS ────────────────────────────────────────────────────");
for (const [k, v] of Object.entries(group("cls")).sort((a, z) => z[1].w / z[1].bouts - a[1].w / a[1].bouts)) {
    console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(3)} chars   ${pct(v.w, v.bouts).padStart(6)} win`);
}

console.log("\n── BY BUILD SHAPE ──────────────────────────────────────────────");
for (const [k, v] of Object.entries(group("strat")).sort((a, z) => z[1].w / z[1].bouts - a[1].w / a[1].bouts)) {
    console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(3)} chars   ${pct(v.w, v.bouts).padStart(6)} win`);
}

// ── THE WARDROBE, WHICH IS THE THING THEY DID NOT CHOOSE TODAY ───────────────────────────────────────────────
// Every member appears under several classes and several build shapes, so their line here is their GEAR's win
// rate with the build averaged out. A field where this column runs 0% to 100% is a field where the ten points
// are decoration.
console.log("\n── BY MEMBER (their real equipped gear, builds averaged out) ───");
const perMember = {};
for (const c of field) {
    perMember[c.who] ||= { w: 0, bouts: 0, n: 0, sheet: c.sheet, days: c.days, streak: c.streak };
    perMember[c.who].w += c.w; perMember[c.who].bouts += c.bouts; perMember[c.who].n += 1;
}
const mrows = Object.entries(perMember).sort((a, z) => z[1].w / z[1].bouts - a[1].w / a[1].bouts);
for (const [who, v] of mrows) {
    console.log(`  ${pct(v.w, v.bouts).padStart(6)}  ${who.slice(0, 18).padEnd(20)} ${String(v.days).padStart(2)}/14 days  streak ${String(v.streak).padStart(2)}   dmg ${String(v.sheet.dmg).padStart(5)}  hp ${String(v.sheet.hp).padStart(4)}  arm ${String(v.sheet.armor).padStart(4)}  spd ${String(v.sheet.spd).padStart(5)}`);
}

// ── DOES THE BUILD MATTER AT ALL? ────────────────────────────────────────────────────────────────────────────
// The honest version of the question: hold ONE member's gear still and see how far apart their best and worst
// ten-point spends land. That gap is the whole of what a member controls today.
console.log("\n── BUILD SPREAD, ONE WARDROBE AT A TIME ────────────────────────");
const gaps = [];
for (const [who] of mrows) {
    const cs = field.filter((c) => c.who === who);
    const best = cs.reduce((a, c) => (rate(c) > rate(a) ? c : a), cs[0]);
    const worst = cs.reduce((a, c) => (rate(c) < rate(a) ? c : a), cs[0]);
    const gap = (rate(best) - rate(worst)) * 100;
    gaps.push(gap);
    // Named by CLASS AND SHAPE. Labelled by shape alone this read "best rush-t2, worst rush-t2" — the same ten
    // points under two different classes, which is a true fact about the tree and a useless line on a page.
    const tag = (c) => `${c.clsName.slice(0, 4).toLowerCase()}/${c.strat}`;
    console.log(`  ${who.slice(0, 18).padEnd(20)} best ${tag(best).padEnd(17)} ${pct(best.w, best.bouts).padStart(6)}   worst ${tag(worst).padEnd(17)} ${pct(worst.w, worst.bouts).padStart(6)}   gap ${gap.toFixed(0)} pts`);
}
console.log(`  ${"".padEnd(20)} the ten points are worth ${avg(gaps).toFixed(0)} points of win rate on average`);

// ── IS IT THE GEAR OR THE BUILD? ─────────────────────────────────────────────────────────────────────────────
// Pearson between a character's sheet and their win rate. A ladder where one number predicts the result is a
// ladder with one build on it.
const corr = (get) => {
    const xs = field.map(get);
    const ys = field.map(rate);
    const mx = avg(xs);
    const my = avg(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i += 1) {
        const a = xs[i] - mx;
        const b = ys[i] - my;
        num += a * b; dx += a * a; dy += b * b;
    }
    return dx && dy ? num / Math.sqrt(dx * dy) : 0;
};
console.log("\n── WHAT PREDICTS A WIN ─────────────────────────────────────────");
for (const [label, get] of [
    ["damage", (c) => c.sheet.dmg], ["health", (c) => c.sheet.hp], ["armour", (c) => c.sheet.armor],
    ["speed", (c) => c.sheet.spd], ["crit chance", (c) => c.sheet.crit],
    ["dmg x speed", (c) => c.sheet.dmg * c.sheet.spd],
]) {
    const r = corr(get);
    console.log(`  ${label.padEnd(13)} r = ${r >= 0 ? " " : ""}${r.toFixed(3)}`);
}

// ── WHY A FIGHT RUNS AS LONG AS IT DOES ──────────────────────────────────────────────────────────────────────
// Mitigation is FLAT — `blow = max(1, raw - armour)` — so what decides a swing is not the RATIO of damage to
// armour but the DIFFERENCE, and a difference can go to nothing. When it does, the floor of 1 takes over and the
// bout is decided by whose health bar is longer several hundred swings later. A mirror match cannot show this
// (both sides scale together) and neither can a tuned dummy. Only a field can.
console.log("\n── DOES A BLOW GET THROUGH? ────────────────────────────────────");
let floored = 0;
let pairs = 0;
const toKill = [];
for (const a of field) {
    for (const b of field) {
        if (a === b) continue;
        pairs += 1;
        const blow = Math.max(1, Math.round(a.sheet.dmg - b.sheet.armor * (1 - Math.min(1, (Number(a.fighter.pierce) || 0) * 0.005))));
        if (blow <= 1) floored += 1;
        toKill.push(b.sheet.hp / blow);
    }
}
toKill.sort((x, y) => x - y);
console.log(`  avg swing ${Math.round(avg(field.map((c) => c.sheet.dmg)))} · avg armour ${Math.round(avg(field.map((c) => c.sheet.armor)))} · avg health ${Math.round(avg(field.map((c) => c.sheet.hp)))}`);
console.log(`  ${pct(floored, pairs)} of matchups land the FLOOR of 1 damage a swing`);
console.log(`  median swings to kill ${Math.round(toKill[Math.floor(toKill.length / 2)])} · worst ${Math.round(toKill[toKill.length - 1])}`);

console.log("\n── THE FIGHTS THEMSELVES ───────────────────────────────────────");
// A swing is roughly a second of ring time, so the swing count is also how long a member sits watching it.
const secs = swingSum / bouts;
console.log(`  ${secs.toFixed(1)} swings on average — about ${secs < 90 ? `${Math.round(secs)}s` : `${(secs / 60).toFixed(1)} min`} of ring time`);
console.log(`  ${unresolved} of ${bouts} never resolved (${pct(unresolved, bouts)})`);
const ranked = [...field].sort((a, z) => rate(z) - rate(a));
console.log(`  best ${pct(ranked[0].w, ranked[0].bouts)} · worst ${pct(ranked[ranked.length - 1].w, ranked[ranked.length - 1].bouts)} — a spread of ${((rate(ranked[0]) - rate(ranked[ranked.length - 1])) * 100).toFixed(0)} points\n`);
process.exit(0);
