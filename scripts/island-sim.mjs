// ── IS THE EXPEDITION A GAME, AND CAN IT EVER CHEAT SOMEBODY ─────────────────────────────────────────────────
// The Forest's first numbers were badly wrong and nobody knew until this script existed — every tree fell in
// under two seconds. So: drive real bearings through the real rules, over every island, before a screen is drawn.
//
//   npm run sim:islands
//
// It answers five questions, and the first one is the one that matters:
//
//   1. CAN A BAD READING EVER FAIL TO REACH THE PRIZE?   It must not. Ever. Not once in any seed.
//   2. How long is the walk, in steps and in seconds?
//   3. What is actually standing on an island — is it a walk, or a corridor of buttons?
//   4. What does an island pay, and does the archipelago curve upward from rung 1 to rung 25?
//   5. Does the captain's grade actually make his landmarks easier to take a bearing off?
//
// ⚠️ THE PLOT IS GONE AND THIS FILE FOLLOWED IT. The minigame used to be trilateration — three distance rings
// on a unit square, drop a pin, scored by `plotAccuracy`. Luke: *"right now, that makes no sense at all."* It
// is now three bearings taken through a spyglass, scored by `bearingAccuracy`. Everything downstream is
// unchanged, because both minigames emit the same single scalar and `landfall()` is written against that
// scalar — which is exactly why it was worth keeping that shape when the puzzle was thrown away.

import { ISLANDS, islandById, prizeFor } from "@/lib/marketplace/islands.js";
import {
    GLASS_FOV, GLASS_SWELL, GLASS_SWELL_MS,
    bearingAccuracy, bearingBand, bearingFace, bearingScore, chartFace, landfall, plotBand, windowFor,
} from "@/lib/marketplace/chart-plot.js";
import { census, islandPurse, layout, nodeValue, reachable, STEP_MS, DWELL_MS } from "@/lib/marketplace/island-world.js";
import { tierForRung, runFoes } from "@/lib/marketplace/island-wardens.js";

const SEEDS = 400;
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);
const pct = (n) => `${(n * 100).toFixed(0)}%`;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const rng = (s) => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ── THE GLASS, AS A HAND ACTUALLY HOLDS IT ───────────────────────────────────────────────────────────────────
// These three were mirrored here as local consts, out of a "use client" component that did not export them,
// with a comment asking whoever changed one to remember to change the other. They live in chart-plot.js now —
// pure, beside the scorer, imported by both — because "remember to change it in two places" is the promise
// that fails. A sim modelling a calmer sea than the one on screen would happily bless a minigame nobody can
// play. See [[balance-constants-never-copied]].
const SWELL = GLASS_SWELL;
const SWELL_MS = GLASS_SWELL_MS;
const FOV = GLASS_FOV;

// The client's swell, to the letter — two sines at an irrational ratio so the drift never settles into a
// countable rhythm. Sampled at a random instant rather than assumed to be uniform noise, because the shape of
// the wave decides how often the wire is near its extremes, and that is the difference between "you can time
// it" and "you can't".
const swellAt = (t) => (((Math.sin((t / SWELL_MS) * Math.PI * 2) + Math.sin((t / (SWELL_MS * 0.61)) * Math.PI * 2) * 0.45) / 1.45) * SWELL);

// A hand at the rail. `skill` 1 aims dead at the mark; 0 calls anywhere along the horizon. What it returns is
// the three numbers the browser would POST — where the WIRE was, which is where you aimed plus whatever the sea
// was doing at the instant you said now.
//
// ⚠️ A PERFECT PLAYER IS STILL NOT A PERFECT READING, AND THAT IS THE WHOLE REASON THE SWELL IS MODELLED HERE.
// The wire is never still, so even skill 1 lands somewhere inside ±SWELL of the mark. A sim that let a perfect
// aim score a flat 1 would be measuring a game nobody is playing — and it would hide the exact bug that was
// found by hand instead: a scoring window barely wider than the swell, where three perfectly-aimed calls all
// came back "Barely a bearing".
//
// ⚠️ AND THE AIM ERROR IS IN SWEEP UNITS, NOT IN WINDOWS. A thumb does not know what the captain said. That is
// what makes the grade legible at all — the same hand held against a wider window scores better, which is the
// entire claim section 5 exists to check. In windows, WILD_AIM is nine of them out at one star and three at
// five, so a poor hand is off by a multiple of the window either way; it is just off by the same DISTANCE.
const WILD_AIM = 0.5;
function takeBearings(glass, skill, r) {
    const stray = Math.max(0, 1 - skill) * WILD_AIM;
    return glass.marks.map((m) => clamp01(m.at + (r() - 0.5) * 2 * stray + swellAt(r() * 100000)));
}

// ── HOW MUCH OF AN ISLAND A RUN ACTUALLY TOUCHES ─────────────────────────────────────────────────────────────
// ⚠️ THE FIRST MODEL HERE WAS NONSENSE and it made accuracy look worthless: it counted every node within `tide`
// of both ends, which on a forty-node island is the entire island, so a wild guess "reached" as much as a
// perfect plot. A walk is a LINE, not a radius.
//
// A run covers one contiguous stretch [a,b] that must contain both the beach and the mark. Walking it costs
// the span plus one backtrack — (b-a) + min(entry-a, b-entry) — because you can double back once but the boat
// picks you up wherever you finish. So the best a player can do is the widest stretch that fits in the tide,
// and that is what accuracy buys: a short walk to the mark leaves budget to widen the stretch.
function routeOf(seed, isle, lf) {
    const lo = Math.min(lf.entry, lf.fixIndex), hi = Math.max(lf.entry, lf.fixIndex);
    let best = [lo, hi];
    for (let a = 0; a <= lo; a += 1) {
        for (let b = hi; b < isle.span; b += 1) {
            const cost = (b - a) + Math.min(lf.entry - a, b - lf.entry);
            if (cost <= lf.tide && (b - a) > (best[1] - best[0])) best = [a, b];
        }
    }
    const nodes = layout(seed, isle.id, lf.fixIndex).filter((n) => n.i >= best[0] && n.i <= best[1] && n.kind !== "empty");
    return {
        a: best[0], b: best[1],
        stops: nodes.map((n) => n.kind),
        coin: nodes.reduce((acc, n) => acc + (nodeValue(n, isle.rung).doubloons || 0), 0),
    };
}

// ── 1 · THE GUARANTEE ────────────────────────────────────────────────────────────────────────────────────────
// Every island, every grade, every seed, every hand including one that never took a bearing at all: is the tide
// always enough to walk from where you beached to the mark? If this ever prints a failure the feature is a wall
// and must not ship. See [[captains-brig]].
//
// ⚠️ "NOTHING POSTED AT ALL" IS A HAND, AND IT BELONGS IN THE SWEEP. `commitBearings` promises that missing,
// wild or malformed bearings score zero and SAIL ANYWAY — a minigame that can error is a minigame that can cost
// somebody the captain they just beat. So the floor of this sweep is not "a bad player", it is a client that
// posted an empty array, which is the worst number the server can ever be handed.
console.log("\n═══ 1 · CAN A READING EVER COST SOMEBODY THE PRIZE? ═══");
const HANDS = [null, 0, 0.15, 0.4, 0.7, 1];
let checked = 0, unreachable = 0, worstSlack = Infinity, worstAt = null, worstAcc = 1;
for (const isle of ISLANDS) {
    for (let grade = 1; grade <= 5; grade += 1) {
        for (let s = 0; s < SEEDS; s += 1) {
            const seed = s * 7919 + isle.rung * 101 + grade;
            // The horizon the player sweeps, and the chart the tide is measured off. Same seed, same grade, so
            // they describe one place — `landfall` reads the chart face exactly as `commitBearings` hands it.
            const glass = bearingFace(seed, grade);
            const face = chartFace(seed, grade);
            // Force this island rather than take the one the grade would pick, so every island is tested at
            // every grade — a guarantee that only holds for the grade band an island normally sits in is not
            // a guarantee, it is a coincidence waiting for someone to widen a band.
            for (const skill of HANDS) {
                const taken = skill === null ? [] : takeBearings(glass, skill, rng(seed + Math.round(skill * 1000)));
                const acc = bearingAccuracy(glass, taken);
                const lf = landfall(face, acc, isle.span);
                checked += 1;
                if (acc < worstAcc) worstAcc = acc;
                const slack = lf.tide - lf.walk;
                if (slack < worstSlack) { worstSlack = slack; worstAt = `${isle.name} g${grade} acc ${pct(acc)}`; }
                // Walk from the beach to the mark, then check the claim the server would check.
                if (!reachable({ span: lf.span, entry: lf.entry, to: lf.fixIndex, spent: lf.walk, tide: lf.tide })) {
                    unreachable += 1;
                    if (unreachable < 4) console.log(`   ✗ ${isle.name} grade ${grade} seed ${seed}: entry ${lf.entry} fix ${lf.fixIndex} walk ${lf.walk} tide ${lf.tide}`);
                }
            }
        }
    }
}
console.log(`   ${checked.toLocaleString()} readings checked across all 25 islands × 5 grades × ${HANDS.length} hands (one of them posted nothing at all)`);
console.log(`   the worst reading any of them produced scored ${pct(worstAcc)} — the floor really is the floor`);
console.log(unreachable === 0
    ? `   ✓ the mark was reachable EVERY time. Thinnest margin: ${worstSlack} spare steps (${worstAt})`
    : `   ✗✗ ${unreachable} readings could not reach the prize — THIS IS A WALL, DO NOT SHIP`);

// ── 2 · HOW LONG IS AN ISLAND ────────────────────────────────────────────────────────────────────────────────
// ⚠️ WALKING IS NOT THE EXPEDITION. The first cut of this counted steps × STEP_MS and reported eleven seconds,
// which is true and useless: most of the time on an island is spent STOPPED, at the dozen things you walk up
// to. So it prices the whole thing — the walk, plus every node the route passes, at DWELL_MS each — and
// reports the optional minigames separately, because a dig board is a minute of its own and it is a CHOICE.
console.log("\n═══ 2 · THE EXPEDITION — is it about two minutes? ═══");
console.log(`   ${pad("the hand", 22)} ${num("reading", 8)} ${num("walk", 5)} ${num("tide", 5)} ${num("stops", 6)} ${num("walk+stops", 11)} ${num("+ digs/fights", 14)}`);
for (const [label, skill] of [["dead at the rail", 1], ["a steady hand", 0.8], ["a fair call", 0.55], ["rushed", 0.3], ["called at random", 0]]) {
    let steps = 0, tide = 0, core = 0, extra = 0, stops = 0, acc = 0, n = 0;
    for (const isle of ISLANDS) {
        for (let s = 0; s < 40; s += 1) {
            const seed = s * 31 + isle.rung;
            const grade = Math.ceil(isle.rung / 5);
            const glass = bearingFace(seed, grade);
            const a = bearingAccuracy(glass, takeBearings(glass, skill, rng(seed)));
            const lf = landfall(chartFace(seed, grade), a, isle.span);
            const route = routeOf(seed, isle, lf);
            steps += lf.walk; tide += lf.tide; stops += route.stops.length; acc += a; n += 1;
            // The tide is the budget, so the walk that actually happens is the whole of it.
            core += lf.tide * STEP_MS + route.stops.reduce((t, k) => t + (["dig", "warden"].includes(k) ? 0 : DWELL_MS[k] || 0), 0);
            extra += route.stops.reduce((t, k) => t + (["dig", "warden"].includes(k) ? DWELL_MS[k] || 0 : 0), 0);
        }
    }
    console.log(`   ${pad(label, 22)} ${num(pct(acc / n), 8)} ${num((steps / n).toFixed(0), 5)} ${num((tide / n).toFixed(0), 5)} ${num((stops / n).toFixed(1), 6)} ${num(`${(core / n / 1000).toFixed(0)}s`, 11)} ${num(`+${(extra / n / 1000).toFixed(0)}s`, 14)}`);
}

// ── 3 · WHAT IS ON THE GROUND ────────────────────────────────────────────────────────────────────────────────
console.log("\n═══ 3 · WHAT IS STANDING ON AN ISLAND — a walk, or a corridor of buttons? ═══");
console.log(`   ${pad("island", 24)} ${num("span", 5)} ${num("empty", 7)}  dig wreck cache forage shrine warden`);
for (const isle of [ISLANDS[0], ISLANDS[4], ISLANDS[7], ISLANDS[12], ISLANDS[17], ISLANDS[22], ISLANDS[24]]) {
    const seed = isle.rung * 13 + 5;
    const face = chartFace(seed, Math.ceil(isle.rung / 5));
    const lf = landfall(face, 0.8, isle.span);
    const c = census(seed, isle.id, lf.fixIndex);
    const e = (c.empty || 0) / isle.span;
    console.log(`   ${pad(isle.name, 24)} ${num(isle.span, 5)} ${num(pct(e), 7)}  ${num(c.dig || 0, 3)} ${num(c.wreck || 0, 5)} ${num(c.cache || 0, 5)} ${num(c.forage || 0, 6)} ${num(c.shrine || 0, 6)} ${num(c.warden || 0, 6)}`);
}

// ── 4 · WHAT AN ISLAND PAYS ──────────────────────────────────────────────────────────────────────────────────
// The archipelago has to curve. If rung 25 pays what rung 1 pays, the grade of a captain's chart means nothing
// and the whole of Luke's original captains idea is cosmetic.
console.log("\n═══ 4 · THE PURSE — does the archipelago curve from rung 1 to rung 25? ═══");
console.log(`   ${pad("island", 24)} ${num("rung", 5)} ${num("tier", 5)} ${num("all doubloons", 14)} ${num("typical run", 12)}  prize`);
for (const isle of ISLANDS) {
    if (isle.rung % 4 !== 1 && isle.rung !== 25) continue;
    let full = 0, typical = 0;
    for (let s = 0; s < 60; s += 1) {
        const seed = s * 17 + isle.rung;
        const face = chartFace(seed, Math.ceil(isle.rung / 5));
        const lf = landfall(face, 0.7, isle.span);
        full += islandPurse(seed, isle.id, lf.fixIndex);
        typical += routeOf(seed, isle, lf).coin;
    }
    const foes = runFoes(isle.id, isle.rung).map((f) => f.name).join(" → ");
    console.log(`   ${pad(isle.name, 24)} ${num(isle.rung, 5)} ${num(tierForRung(isle.rung), 5)} ${num(Math.round(full / 60), 14)} ${num(Math.round(typical / 60), 12)}  ${prizeFor(isle).name}`);
    console.log(`   ${pad("", 24)} ${pad("", 5)} fights: ${foes}`);
}

// ── 5 · IS A BETTER CAPTAIN ACTUALLY EASIER TO TAKE A BEARING OFF ────────────────────────────────────────────
// Half of Luke's captains idea is that the stars mean something beyond which island you get. What they mean now
// is the WINDOW: how wide a band around a landmark still counts as having taken its bearing. A man who says
// "the Widow's Light, third stack from the left, with the broken lantern" can be called in one pass; a man who
// says "a rock, I think" cannot. So his stars WIDEN the window.
//
// ⚠️ THIS SECTION EXISTS BECAUSE THE TABLE SHIPPED INVERTED AND A HUMAN CAUGHT IT, NOT THE SIM. BEARING_WINDOW
// was first written narrowing as the stars went up — 0.150 at one star down to 0.042 at five — which reads fine
// as "a better chart is more precise" and is wrong twice over: it made the best captain the hardest to read,
// and because accuracy buys tide slack it handed the most slack to the worst informant. It was found by
// PLAYING it, when three perfectly-aimed calls at five stars all came back "Barely a bearing". A sim is where
// that should have died, so this is the measurement that would have killed it: hold the hand still, vary only
// the grade, and check the numbers move the right way.
//
// The hands are fixed jitters in SWEEP UNITS, because a thumb does not know what the captain said — see
// takeBearings above. Everything the grade does has to show up as the same hand scoring differently.
console.log("\n═══ 5 · IS A BETTER CAPTAIN EASIER TO TAKE A BEARING OFF? ═══");
const AIMS = [
    { id: "perfect", say: "perfect aim", jitter: 0 },       // dead on the mark; only the sea moves the wire
    { id: "steady", say: "a steady hand", jitter: 0.035 },  // a careful player, a third of the swell out on top of it
    { id: "rushed", say: "a rushed call", jitter: 0.090 },  // called it while it was still coming into the glass
];
const GRADE_ROWS = [];
for (let grade = 1; grade <= 5; grade += 1) {
    const win = windowFor(grade);
    const row = { grade, win, band: (win * 2) / FOV, acc: {}, slack: {} };
    for (const aim of AIMS) {
        let acc = 0, slack = 0, n = 0;
        for (let s = 0; s < 400; s += 1) {
            const seed = s * 37 + grade;
            const r = rng(seed + Math.round(aim.jitter * 1000));
            const glass = bearingFace(seed, grade);
            const taken = glass.marks.map((m) => clamp01(m.at + (r() - 0.5) * 2 * aim.jitter + swellAt(r() * 100000)));
            const a = bearingAccuracy(glass, taken);
            // Straight into the real landfall, on the island this grade actually names — the point is what the
            // reading BUYS, and what it buys is spare steps to search the island with.
            const isle = islandById(glass.island) || ISLANDS[0];
            const lf = landfall(chartFace(seed, grade), a, isle.span);
            acc += a; slack += lf.tide - lf.walk; n += 1;
        }
        row.acc[aim.id] = acc / n;
        row.slack[aim.id] = slack / n;
    }
    GRADE_ROWS.push(row);
}
console.log(`   ${pad("grade", 8)} ${num("window", 8)} ${num("of the glass", 13)} ${num("perfect", 9)} ${num("steady", 8)} ${num("rushed", 8)}   spare steps p/s/r`);
for (const row of GRADE_ROWS) {
    const stars = `${"★".repeat(row.grade)}${"☆".repeat(5 - row.grade)}`;
    const slack = `${row.slack.perfect.toFixed(0)}/${row.slack.steady.toFixed(0)}/${row.slack.rushed.toFixed(0)}`;
    console.log(`   ${pad(stars, 8)} ${num(`±${row.win.toFixed(3)}`, 8)} ${num(pct(row.band), 13)} ${num(pct(row.acc.perfect), 9)} ${num(pct(row.acc.steady), 8)} ${num(pct(row.acc.rushed), 8)}   ${slack}`);
}
// The verdict in words, because a navigator does not say 0.78. `plotBand` is the same function the screen uses
// to name a reading, so this cannot drift from what the player is told they did. See
// [[reuse-the-rule-never-restate-it]].
console.log("");
for (const row of GRADE_ROWS) {
    const stars = `${"★".repeat(row.grade)}${"☆".repeat(5 - row.grade)}`;
    const fills = row.band >= 1 ? "the band is wider than the glass — anything you can SEE, you can call" : `the band is ${pct(row.band)} of the glass`;
    console.log(`   ${stars}  steady hand → ${pad(plotBand(row.acc.steady).name, 18)} rushed → ${pad(plotBand(row.acc.rushed).name, 18)} ${fills}`);
}
// ⚠️ THE ORDERING IS THE WHOLE TEST. If a reading does not get better with every star, for every hand, the
// grade is either decoration or inverted — and inverted is the bug that already shipped once.
const drift = [];
for (const aim of AIMS) {
    for (let i = 1; i < GRADE_ROWS.length; i += 1) {
        if (GRADE_ROWS[i].acc[aim.id] < GRADE_ROWS[i - 1].acc[aim.id] - 1e-9) drift.push(`${aim.say} ${GRADE_ROWS[i - 1].grade}★→${GRADE_ROWS[i].grade}★`);
        if (GRADE_ROWS[i].slack[aim.id] < GRADE_ROWS[i - 1].slack[aim.id] - 1e-9) drift.push(`${aim.say} slack ${GRADE_ROWS[i - 1].grade}★→${GRADE_ROWS[i].grade}★`);
    }
}
const spread = GRADE_ROWS[4].acc.rushed - GRADE_ROWS[0].acc.rushed;
console.log("");
console.log(drift.length === 0
    ? `   ✓ every star reads better than the one below it, for all three hands — the grade is legible`
    : `   ✗✗ NOT MONOTONIC — the grade does not order: ${drift.join(", ")}. CHECK BEARING_WINDOW, IT HAS BEEN INVERTED BEFORE`);
console.log(spread >= 0.08
    ? `   ✓ a rushed call is worth ${pct(spread)} more at five stars than at one (${pct(GRADE_ROWS[0].acc.rushed)} → ${pct(GRADE_ROWS[4].acc.rushed)}) — the stars are doing work`
    : `   ✗✗ only ${pct(spread)} between a one-star and a five-star reading — THE GRADE IS DECORATION`);

// A worked example, so the horizon a player is actually handed can be read rather than trusted.
console.log("\n═══ THE HORIZON, AS IT WOULD BE HANDED TO YOU ═══");
for (const grade of [1, 5]) {
    const glass = bearingFace(4242 + grade, grade);
    const isle = islandById(glass.island);
    console.log(`\n   ${"★".repeat(grade)}${"☆".repeat(5 - grade)}  →  ${isle.name} (rung ${isle.rung}, ${isle.biome}) · window ±${glass.window.toFixed(3)} of the sweep`);
    const r = rng(9001 + grade);
    const taken = glass.marks.map((m) => clamp01(m.at + (r() - 0.5) * 2 * 0.035 + swellAt(r() * 100000)));
    glass.marks.forEach((m, i) => {
        const score = bearingScore(m, taken[i]);
        console.log(`      ${pad(m.mark, 26)} ${pad(m.says, 32)} ${m.exact ? "(a number)" : "(he would not say)"}  sits at ${m.at.toFixed(3)}, called ${taken[i].toFixed(3)} → ${bearingBand(score).say}`);
    });
    const acc = bearingAccuracy(glass, taken);
    const lf = landfall(chartFace(4242 + grade, grade), acc, isle.span);
    console.log(`      a steady hand → ${plotBand(acc).name} (${pct(acc)}), beach at node ${lf.entry} of ${lf.span}, mark at ${lf.fixIndex}, tide ${lf.tide} for a ${lf.walk}-step walk`);
}
console.log("");
