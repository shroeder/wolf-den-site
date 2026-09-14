// ── IS THE EXPEDITION A GAME, AND CAN IT EVER CHEAT SOMEBODY ─────────────────────────────────────────────────
// The Forest's first numbers were badly wrong and nobody knew until this script existed — every tree fell in
// under two seconds. So: drive real plots through the real rules, over every island, before a screen is drawn.
//
//   npm run sim:islands
//
// It answers five questions, and the first one is the one that matters:
//
//   1. CAN A BAD PLOT EVER FAIL TO REACH THE PRIZE?   It must not. Ever. Not once in any seed.
//   2. How long is the walk, in steps and in seconds?
//   3. What is actually standing on an island — is it a walk, or a corridor of buttons?
//   4. What does an island pay, and does the archipelago curve upward from rung 1 to rung 25?
//   5. Does the chart get measurably harder to read as the grade drops?

import { ISLANDS, islandById, prizeFor, landmarksFor } from "@/lib/marketplace/islands.js";
import { chartFace, solveChart, plotAccuracy, landfall, readingFor, plotBand, leaguesOf } from "@/lib/marketplace/chart-plot.js";
import { census, islandPurse, layout, nodeValue, reachable, STEP_MS, DWELL_MS } from "@/lib/marketplace/island-world.js";
import { escortFor, wardenFor, tierForRung, runFoes } from "@/lib/marketplace/island-wardens.js";

const SEEDS = 400;
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);
const pct = (n) => `${(n * 100).toFixed(0)}%`;

// A plotter with a given amount of skill. `skill` 1 puts the pin on the fix; 0 puts it somewhere at random on
// the paper. Everything between is a real hand: aim at the truth, miss by a bit.
function plot(face, skill, r) {
    if (skill >= 1) return { ...face.fix };
    const stray = (1 - skill) * 0.55;
    return {
        x: Math.max(0, Math.min(1, face.fix.x + (r() - 0.5) * 2 * stray)),
        y: Math.max(0, Math.min(1, face.fix.y + (r() - 0.5) * 2 * stray)),
    };
}
const rng = (s) => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

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
// Every island, every grade, every seed, every skill level including none at all: is the tide always enough to
// walk from where you beached to the mark? If this ever prints a failure the feature is a wall and must not
// ship. See [[captains-brig]].
console.log("\n═══ 1 · CAN A PLOT EVER COST SOMEBODY THE PRIZE? ═══");
let checked = 0, unreachable = 0, worstSlack = Infinity, worstAt = null;
for (const isle of ISLANDS) {
    for (let grade = 1; grade <= 5; grade += 1) {
        for (let s = 0; s < SEEDS; s += 1) {
            const seed = s * 7919 + isle.rung * 101 + grade;
            const face = chartFace(seed, grade);
            // Force this island rather than take the one the grade would pick, so every island is tested at
            // every grade — a guarantee that only holds for the grade band an island normally sits in is not
            // a guarantee, it is a coincidence waiting for someone to widen a band.
            for (const skill of [0, 0.15, 0.4, 0.7, 1]) {
                const r = rng(seed + Math.round(skill * 1000));
                const at = plot(face, skill, r);
                const acc = plotAccuracy(face, at);
                const lf = landfall(face, acc, isle.span);
                checked += 1;
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
console.log(`   ${checked.toLocaleString()} plots checked across all 25 islands × 5 grades × 5 skill levels`);
console.log(unreachable === 0
    ? `   ✓ the mark was reachable EVERY time. Thinnest margin: ${worstSlack} spare steps (${worstAt})`
    : `   ✗✗ ${unreachable} plots could not reach the prize — THIS IS A WALL, DO NOT SHIP`);

// ── 2 · HOW LONG IS AN ISLAND ────────────────────────────────────────────────────────────────────────────────
// ⚠️ WALKING IS NOT THE EXPEDITION. The first cut of this counted steps × STEP_MS and reported eleven seconds,
// which is true and useless: most of the time on an island is spent STOPPED, at the dozen things you walk up
// to. So it prices the whole thing — the walk, plus every node the route passes, at DWELL_MS each — and
// reports the optional minigames separately, because a dig board is a minute of its own and it is a CHOICE.
console.log("\n═══ 2 · THE EXPEDITION — is it about two minutes? ═══");
console.log(`   ${pad("plot", 18)} ${num("walk", 5)} ${num("tide", 5)} ${num("stops", 6)} ${num("walk+stops", 11)} ${num("+ digs/fights", 14)}`);
for (const [label, skill] of [["dead on the mark", 1], ["a good cut", 0.72], ["a fair reckoning", 0.45], ["loose", 0.25], ["a wild guess", 0]]) {
    let steps = 0, tide = 0, core = 0, extra = 0, stops = 0, n = 0;
    for (const isle of ISLANDS) {
        for (let s = 0; s < 40; s += 1) {
            const seed = s * 31 + isle.rung;
            const face = chartFace(seed, Math.ceil(isle.rung / 5));
            const at = plot(face, skill, rng(seed));
            const lf = landfall(face, plotAccuracy(face, at), isle.span);
            const route = routeOf(seed, isle, lf);
            steps += lf.walk; tide += lf.tide; stops += route.stops.length; n += 1;
            // The tide is the budget, so the walk that actually happens is the whole of it.
            core += lf.tide * STEP_MS + route.stops.reduce((a, k) => a + (["dig", "warden"].includes(k) ? 0 : DWELL_MS[k] || 0), 0);
            extra += route.stops.reduce((a, k) => a + (["dig", "warden"].includes(k) ? DWELL_MS[k] || 0 : 0), 0);
        }
    }
    console.log(`   ${pad(label, 18)} ${num((steps / n).toFixed(0), 5)} ${num((tide / n).toFixed(0), 5)} ${num((stops / n).toFixed(1), 6)} ${num(`${(core / n / 1000).toFixed(0)}s`, 11)} ${num(`+${(extra / n / 1000).toFixed(0)}s`, 14)}`);
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

// ── 5 · IS A BAD CHART ACTUALLY HARDER TO READ ───────────────────────────────────────────────────────────────
// The lens where all three ring bands overlap is what a player is actually aiming at. If a one-star chart's
// lens is the same size as a five-star chart's, the grade is decoration.
console.log("\n═══ 5 · DOES THE GRADE CHANGE HOW LEGIBLE THE CHART IS? ═══");
// ⚠️ MEASURE THE SPREAD, NOT THE CENTROID. The first cut of this scored "a careful plot" as the centre of mass
// of the lens — and the lens is roughly symmetric about the truth, so its centroid IS the truth and every grade
// came back at 92%+. That says nothing about how hard the chart is; it says the ambiguity is unbiased, which we
// already knew. What a real hand does is pick SOMEWHERE plausible, so this samples points from inside the lens
// and reports what they score. A tight chart has nowhere bad to put the pin; a loose one has plenty.
console.log(`   ${pad("grade", 7)} ${num("exact rings", 12)} ${num("lens", 7)} ${num("careful", 9)} ${num("plausible", 11)} ${num("worst plausible", 17)}`);
for (let grade = 1; grade <= 5; grade += 1) {
    const read = readingFor(grade);
    let lens = 0, careful = 0, mean = 0, worst = 0, charts = 0;
    for (let s = 0; s < 300; s += 1) {
        const face = chartFace(s * 37 + grade, grade);
        const inside = [];
        for (let gx = 0; gx < 40; gx += 1) for (let gy = 0; gy < 40; gy += 1) {
            const x = (gx + 0.5) / 40, y = (gy + 0.5) / 40;
            if (face.soundings.every((so) => Math.abs(Math.hypot(x - so.x, y - so.y) - so.r) <= so.slop)) inside.push({ x, y });
        }
        lens += inside.length / 1600;
        if (!inside.length) continue;
        charts += 1;
        const cx = inside.reduce((a, p) => a + p.x, 0) / inside.length;
        const cy = inside.reduce((a, p) => a + p.y, 0) / inside.length;
        careful += plotAccuracy(face, { x: cx, y: cy });
        const scores = inside.map((p) => plotAccuracy(face, p));
        mean += scores.reduce((a, v) => a + v, 0) / scores.length;
        worst += Math.min(...scores);
    }
    const c = Math.max(1, charts);
    console.log(`   ${pad(grade, 7)} ${num(read.exact, 12)} ${num(pct(lens / 300), 7)} ${num(pct(careful / c), 9)} ${num(pct(mean / c), 11)} ${num(pct(worst / c), 17)}`);
}

// A worked example, so the words on a real chart can be read rather than trusted.
console.log("\n═══ A CHART, AS IT WOULD BE HANDED TO YOU ═══");
for (const grade of [1, 5]) {
    const face = chartFace(4242 + grade, grade);
    const isle = islandById(face.island);
    console.log(`\n   ${"★".repeat(grade)}${"☆".repeat(5 - grade)}  →  ${isle.name} (rung ${isle.rung}, ${isle.biome})`);
    for (const so of face.soundings) {
        console.log(`      ${pad(so.mark, 26)} ${pad(so.says, 32)} ${so.exact ? "(a number)" : "(he would not say)"}  ring ±${so.slop.toFixed(3)}`);
    }
    const solved = solveChart({ seed: 4242 + grade, grade, at: face.fix });
    console.log(`      perfect plot → ${plotBand(solved.accuracy).name}, beach at node ${solved.entry} of ${solved.span}, mark at ${solved.fixIndex}, tide ${solved.tide}`);
}
console.log("");
