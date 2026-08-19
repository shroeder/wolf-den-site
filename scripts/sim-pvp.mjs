// ── A HUNDRED FIGHTERS, A THOUSAND BOUTS ─────────────────────────────────────────────────────────────────────
// Combat was rewritten from the ground up and then tuned against ONE pairing at a time — a mirror match, a
// dummy, a scaled sparring partner. Every one of those answers a question about a fighter. None of them answers
// the question the members are actually asking, which is: given the gear people wear and the ten points they
// have to spend, does the ring reward what you built or what you rolled?
//
// So: a hundred characters, spread across four gear bands so the field is not uniform, each with a class and a
// TEN-POINT allocation drawn from ten named strategies, and a thousand pairings between them.
//
// It runs the REAL code. `fighterFrom` is the same function kitFor spreads to build a member for a live bout,
// and `autoBout` is the resolver the Arena calls. A sim that re-implements either is a sim of a game nobody is
// playing, which is exactly how the Long Road shipped mis-measured.
//
// DETERMINISTIC. Same seed, same field, same thousand fights, so a tuning change is measured against the same
// tournament rather than against a fresh roll of the dice.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-pvp.mjs [pairings=1000] [seed=7]
import { ITEMS, sumItemStats, mergeStats } from "../src/lib/marketplace/items.js";
import { CLASSES, treeFor, treeEffects } from "../src/lib/marketplace/arena-classes.js";
import { fighterFrom, combatStats } from "../src/lib/marketplace/arena.js";
import { autoBout } from "../src/lib/marketplace/arena-engine.js";
import { db } from "../src/lib/db.js";

const FIGHTS = Number(process.argv[2]) || 1000;
const SEED = Number(process.argv[3]) || 7;
const POINTS = 10;

// One generator for the whole run, so the field and the fights are reproducible together.
let _s = SEED >>> 0;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ── THE FIELD ────────────────────────────────────────────────────────────────────────────────────────────────
// Four bands, because a ladder where everyone wears the same thing tells you nothing about whether gear or
// build decides a fight. Roughly the shape of the Den: most people mid-kit, a few at the top, a tail still in
// starter gear.
const BANDS = [
    { name: "starter", rarities: ["common", "rare"], n: 25 },
    { name: "geared", rarities: ["rare", "epic"], n: 35 },
    { name: "endgame", rarities: ["epic", "legendary"], n: 28 },
    { name: "bis", rarities: ["mythic", "ascendant", "eternal"], n: 12 },
];

const SLOTS = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back", "amulet", "ring", "ring"];
const bySlot = {};
for (const it of ITEMS) {
    if (!it.slot || !it.stats) continue;
    (bySlot[it.slot] ||= []).push(it);
}

function loadout(band) {
    const ids = [];
    for (const slot of SLOTS) {
        const pool = (bySlot[slot] || []).filter((i) => band.rarities.includes(i.rarity));
        // A band with nothing in a slot falls back to the whole slot rather than fighting bare-handed —
        // there is no off-hand at every rarity, and a missing shield is a missing 300 armour.
        const from = pool.length ? pool : (bySlot[slot] || []);
        if (from.length) ids.push(pick(from).id);
    }
    return ids;
}

// ── THE TEN BUILDS ───────────────────────────────────────────────────────────────────────────────────────────
// Ten points is what a real member has to spend, and how they spend it is the only decision the tree offers.
// These are the shapes people actually reach for, not random allocations: pour everything into one node, take
// the cheapest three, rush a gate, spread thin. A purely random spread would measure the AVERAGE build, and
// nobody plays the average build — they play the one somebody told them was best.
const OFFENCE = new Set(["crit", "critMult", "critStat", "critPower", "dmgPct", "speed", "might",
    "bleedChance", "bleedDamage", "burnChance", "burnDamage", "doublestrikeBonus", "stunBonus",
    "hasteBonus", "pierceStat", "surge", "soulfire", "cataclysm"]);
const DEFENCE = new Set(["health", "healthPct", "armorPct", "guardChance", "guardSize", "regen", "thorns",
    "ward", "wardRefill", "iceThorns", "chill", "freeze", "blockChance", "blockReductionBonus",
    "lifestealStat", "lifesteal", "lifestealBonus", "grudge", "bleedLeech", "burnLeech"]);

// Points go in ONE AT A TIME, respecting each node's rank ceiling and its gate, because that is the only way
// the tree can actually be spent. A build that "takes" a tier-3 node it has not unlocked is not a build.
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
        // Nothing in the wanted list can take another point — fall back to anything legal, which is what a
        // member does when their plan runs out of ranks before it runs out of points.
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

// ── THE OTHER THREE STAT SOURCES ─────────────────────────────────────────────────────────────────────────────
// Combat reads FOUR: gear, pets, badges and the compendium. A field built from gear alone is a field of
// fighters missing everything they earned outside the shop, and it makes everybody look damage-starved against
// their own armour — a conclusion about a game nobody is playing.
//
// So the non-gear layer is not invented: it is READ OFF THE REAL MEMBERS. combatStats with an empty wardrobe
// returns exactly that layer, and every character draws one from the real distribution, matched to their band
// — the people with the best gear are also the people with the most badges, so pairing a top-band fighter with
// a bottom-percentile layer would be as unrealistic as leaving it out.
async function realLayers() {
    const rows = await db.query(`SELECT id FROM mkt_buyer WHERE display_name IS NOT NULL`).catch(() => []);
    const out = [];
    for (const r of rows) {
        const s = await combatStats(r.id, {}, []).catch(() => null);
        if (!s) continue;
        const sum = Object.values(s).reduce((a, v) => a + (Number(v) || 0), 0);
        if (sum > 0) out.push(s);
    }
    out.sort((a, z) => Object.values(a).reduce((x, v) => x + v, 0) - Object.values(z).reduce((x, v) => x + v, 0));
    return out;
}
const LAYERS = await realLayers();
// Which slice of the real distribution each band draws from.
const WINDOW = { starter: [0, 0.40], geared: [0.25, 0.70], endgame: [0.55, 0.92], bis: [0.85, 1] };
function layerFor(band) {
    if (!LAYERS.length) return {};
    const [lo, hi] = WINDOW[band] || [0, 1];
    const a = Math.floor(lo * (LAYERS.length - 1));
    const b = Math.floor(hi * (LAYERS.length - 1));
    return LAYERS[a + Math.floor(rnd() * Math.max(1, b - a + 1))] || {};
}

const field = [];
let made = 0;
for (const band of BANDS) {
    for (let i = 0; i < band.n; i += 1) {
        const cls = CLASSES[made % CLASSES.length];              // classes split evenly across the field
        const strat = STRATEGIES[made % STRATEGIES.length];      // and so do the ten shapes
        const tree = treeFor(cls.id);
        const taken = strat.how(tree);
        const ids = loadout(band);
        // Gear PLUS the pets/badges/compendium layer — the same four sources combatStats merges for a live bout.
        const stats = mergeStats(sumItemStats(ids), layerFor(band.name));
        const fighter = fighterFrom(stats, treeEffects(cls.id, taken), cls.id);
        field.push({
            id: `c${String(made + 1).padStart(3, "0")}`, band: band.name, cls: cls.id, clsName: cls.name,
            strat: strat.id, taken, spent: Object.values(taken).reduce((a, x) => a + x, 0), stats, fighter,
            // What the ring is worth before a punch is thrown, for asking whether gear or build decided it.
            sheet: {
                dmg: Math.round(fighter.damage), hp: fighter.health, armor: fighter.armor,
                spd: Number(fighter.speed.toFixed(2)), crit: Math.round(fighter.critChance * 100),
            },
            w: 0, l: 0, draw: 0, bouts: 0,
        });
        made += 1;
    }
}

// ── THE TOURNAMENT ───────────────────────────────────────────────────────────────────────────────────────────
// Random pairings across the whole field, which is what the Arena's own matchmaking produces — you challenge
// who is there, not who is your size. Each pairing is run BOTH WAYS off the same seed and both results counted,
// so whatever advantage the engine gives the fighter passed in first cancels out instead of quietly becoming
// half of somebody's win rate.
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

console.log(`\n${field.length} characters · ${POINTS} points each · ${bouts} bouts (${FIGHTS} pairings, both ways) · seed ${SEED}\n`);

console.log(LAYERS.length
    ? `pets/badges/compendium layers sampled from ${LAYERS.length} real members\n`
    : "NO DATABASE — gear only, so every fighter is missing what they earned outside the shop\n");

console.log("── BY CLASS ────────────────────────────────────────────────────");
for (const [k, v] of Object.entries(group("cls")).sort((a, z) => z[1].w / z[1].bouts - a[1].w / a[1].bouts)) {
    console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(3)} chars   ${pct(v.w, v.bouts).padStart(6)} win`);
}

console.log("\n── BY GEAR BAND ────────────────────────────────────────────────");
for (const b of BANDS) {
    const v = group("band")[b.name];
    if (v) console.log(`  ${b.name.padEnd(12)} ${String(v.n).padStart(3)} chars   ${pct(v.w, v.bouts).padStart(6)} win`);
}

console.log("\n── BY BUILD SHAPE ──────────────────────────────────────────────");
for (const [k, v] of Object.entries(group("strat")).sort((a, z) => z[1].w / z[1].bouts - a[1].w / a[1].bouts)) {
    console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(3)} chars   ${pct(v.w, v.bouts).padStart(6)} win`);
}

// Build shape WITHIN a band, because a build's win rate across the whole field is mostly a readout of who
// happened to be wearing what. Holding the gear still is the only way to see the ten points on their own.
console.log("\n── BUILD SHAPE, GEAR HELD STILL ────────────────────────────────");
for (const b of BANDS) {
    const rows = [];
    for (const s of STRATEGIES) {
        const cs = field.filter((c) => c.band === b.name && c.strat === s.id);
        if (!cs.length) continue;
        rows.push([s.id, { w: cs.reduce((a, c) => a + c.w, 0), bouts: cs.reduce((a, c) => a + c.bouts, 0) }]);
    }
    rows.sort((a, z) => z[1].w / z[1].bouts - a[1].w / a[1].bouts);
    if (!rows.length) continue;
    const best = rows[0];
    const worst = rows[rows.length - 1];
    console.log(`  ${b.name.padEnd(9)} best ${best[0].padEnd(11)} ${pct(best[1].w, best[1].bouts).padStart(6)}   worst ${worst[0].padEnd(11)} ${pct(worst[1].w, worst[1].bouts).padStart(6)}`);
}

const ranked = [...field].sort((a, z) => rate(z) - rate(a));
const show = (c) => `  ${pct(c.w, c.bouts).padStart(6)}  ${c.id}  ${c.clsName.padEnd(11)} ${c.strat.padEnd(11)} ${c.band.padEnd(8)} dmg ${String(c.sheet.dmg).padStart(5)}  hp ${String(c.sheet.hp).padStart(4)}  arm ${String(c.sheet.armor).padStart(4)}  spd ${String(c.sheet.spd).padStart(5)}  crit ${c.sheet.crit}%`;
console.log("\n── THE TOP TEN ─────────────────────────────────────────────────");
ranked.slice(0, 10).forEach((c) => console.log(show(c)));
console.log("\n── THE BOTTOM TEN ──────────────────────────────────────────────");
ranked.slice(-10).forEach((c) => console.log(show(c)));

// ── IS IT THE GEAR OR THE BUILD? ─────────────────────────────────────────────────────────────────────────────
// Pearson between a character's sheet and their win rate. A ladder where one number predicts the result is a
// ladder with one build on it.
const corr = (get) => {
    const xs = field.map(get);
    const ys = field.map(rate);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i += 1) {
        const a = xs[i] - mx;
        const b = ys[i] - my;
        num += a * b; dx += a * a; dy += b * b;
    }
    return dx && dy ? num / Math.sqrt(dx * dy) : 0;
};
console.log("\n── WHAT PREDICTS A WIN ─────────────────────────────────────────");
const PREDICTORS = [
    ["damage", (c) => c.sheet.dmg], ["health", (c) => c.sheet.hp], ["armour", (c) => c.sheet.armor],
    ["speed", (c) => c.sheet.spd], ["crit chance", (c) => c.sheet.crit],
    ["dmg x speed", (c) => c.sheet.dmg * c.sheet.spd], ["points spent", (c) => c.spent],
];
for (const [label, get] of PREDICTORS) {
    const r = corr(get);
    console.log(`  ${label.padEnd(13)} r = ${r >= 0 ? " " : ""}${r.toFixed(3)}`);
}

// ── WHY A FIGHT RUNS AS LONG AS IT DOES ──────────────────────────────────────────────────────────────────────
// Mitigation is FLAT — `blow = max(1, raw - armour)` — so what matters is not the ratio of damage to armour but
// the DIFFERENCE, and a difference can go to nothing. When it does, the floor of 1 takes over and the bout is
// decided by whose health bar is longer, several hundred swings later. This is invisible in a mirror match
// (both sides scale together) and invisible against a tuned dummy, which is why it has to be asked of a field.
console.log("\n── ARMOUR AGAINST DAMAGE, BY BAND ──────────────────────────────");
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log("  band        avg swing   avg armour   a typical blow   as % of a health bar");
for (const b of BANDS) {
    const cs = field.filter((c) => c.band === b.name);
    if (!cs.length) continue;
    const dmg = avg(cs.map((c) => c.sheet.dmg));
    const arm = avg(cs.map((c) => c.sheet.armor));
    const hp = avg(cs.map((c) => c.sheet.hp));
    const blow = Math.max(1, Math.round(dmg - arm));
    console.log(`  ${b.name.padEnd(11)} ${String(Math.round(dmg)).padStart(8)} ${String(Math.round(arm)).padStart(12)} ${String(blow).padStart(15)}   ${((blow / hp) * 100).toFixed(2)}%`);
}
// How much of the field cannot meaningfully hurt how much of the field.
let floored = 0;
let pairs = 0;
for (const a of field) {
    for (const b of field) {
        if (a === b) continue;
        pairs += 1;
        if (a.sheet.dmg - b.sheet.armor <= 1) floored += 1;
    }
}
console.log(`  ${pct(floored, pairs)} of every possible matchup lands the FLOOR of 1 damage a swing`);

console.log("\n── THE FIGHTS THEMSELVES ───────────────────────────────────────");
console.log(`  ${(swingSum / bouts).toFixed(1)} swings on average`);
const capped = field.reduce((a, c) => a + c.draw, 0);
console.log(`  a swing is ~1s of ring time, so that is ~${Math.round(swingSum / bouts / 60)} minutes a bout`);
console.log(`  ${capped} fighter-bouts hit the 10,000-swing ceiling without a result`);
console.log(`  ${unresolved} of ${bouts} never resolved (${pct(unresolved, bouts)})`);
const top = ranked[0];
const floor = ranked[ranked.length - 1];
console.log(`  best ${pct(top.w, top.bouts)} · worst ${pct(floor.w, floor.bouts)} — a spread of ${((rate(top) - rate(floor)) * 100).toFixed(0)} points`);
process.exit(0);
