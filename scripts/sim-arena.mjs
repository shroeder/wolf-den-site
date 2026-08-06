// ── ARENA BALANCE SIMULATOR ──────────────────────────────────────────────────────────────────────────────────
// Mirrors fightRound closely enough to measure three things that cannot be judged by reading:
//
//   1. Is the NPC power curve fair? A Gauntlet with a wall at tier 20 that nobody can pass is as broken as one
//      you can farm forever, and 8.5% growth per tier was a guess.
//   2. Are the ELEVEN skill kinds near parity? They were introduced to change the SHAPE of a bout rather than
//      its size, which is only true if a kit of bleeds wins about as often as a kit of big hits.
//   3. Do bouts still run about ten beats?
//
// Deliberately a SEPARATE implementation rather than an import: arena.js is server-only and reaches for the
// database on every path. What matters is that the numbers below are copied from it exactly — if they drift,
// this lies, so they are all named and grouped at the top.
//
// Usage: node scripts/sim-arena.mjs [runs]

// ── CONSTANTS, COPIED FROM arena.js / arena-kit.js ───────────────────────────────────────────────────────────
const SWING = 0.30, PUNCH = 2.12, ATTACK = 1.15, BLOCK = 0.34;
const CRIT_BASE = 0.12, CRIT_PER_FORTUNE = 0.0035, CRIT_CAP = 0.38, CRIT_MULT = 1.8;
const GUARD_SOAK = 0.30, GUARD_COOL = 1, WARD_SOAK = 0.09;
const DRAIN_SHARE = 0.5, REND_TURNS = 3, REND_PER_TURN = 0.045, REND_MAX_STACKS = 3;
const SUNDER_CUT = 0.4, SUNDER_TURNS = 3, RIPOSTE_SHARE = 0.3, SHIELD_CAP = 0.45;
const SURGE_MULT = 1.5, SURGE_SWINGS = 3, EXECUTE_MULT = 1.5, EXECUTE_UNDER = 0.35;
// The kinds that do NOT spend your beat — copied from arena-kit.js's FREE_KINDS. Surge is deliberately not
// one of them: free, it measured 88% at tier 20 against 44%, and 62% even cut to +10% on three swings.
const FREE_KINDS = new Set(["ward", "riposte"]);
const UNDERDOG_MAX = 0.9, UNDERDOG_DEADBAND = 0.35;
const AI_ABILITY_CHANCE = 0.45;

const arenaVigour = (l, g) => Math.round(60 + l * 2.2 + g * 0.55);
const arenaMight = (l, g) => Math.round(9 + l * 0.45 + g * 0.11);
const npcPower = (t) => Math.round(82 * Math.pow(1.045, Math.max(1, t) - 1));

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const hit = (m) => randInt(Math.round(m * 0.85), Math.round(m * 1.18));
const foeGrade = (gp) => {
    const t = Math.max(0, Math.min(1, gp / 320)), r = Math.random();
    if (r < 0.15 + t * 0.35) return { atk: 1.3, def: 0.55 };
    if (r < 0.55 + t * 0.3) return { atk: 1.0, def: 0.32 };
    return { atk: 0.6, def: 0.12 };
};
const underdogEdge = (mine, foe) => {
    const gap = (foe - mine) / Math.max(40, mine) - UNDERDOG_DEADBAND;
    return gap <= 0 ? 1 : 1 + Math.min(UNDERDOG_MAX, gap * 0.75);
};
const critFor = (f) => Math.min(CRIT_CAP, CRIT_BASE + (f || 0) * CRIT_PER_FORTUNE);

// ── THE KITS ─────────────────────────────────────────────────────────────────────────────────────────────────
// Powers copied from ARCHETYPE. A "pure" kit is four copies of one kind, which is how a kind's strength is
// isolated — a mixed kit hides an outlier behind its neighbours.
//
// READ THE PURE COLUMN AS A STRESS TEST, NOT A LOADOUT. Abilities come from the class tree now, and no tree
// holds more than one ward or one riposte, so "four wards" is unreachable in a real bout — which matters
// because four FREE wards refill the shield every single turn and the row reads ~89%. Section 1b, one of the
// kind plus three strikes, is the honest number for the defensive kinds.
const KIND = {
    strike: { power: 2.35, cd: 3 },
    flurry: { power: 0.9, cd: 3, hits: 3 },
    spell: { power: 2.3, cd: 4 },
    execute: { power: 2.4, cd: 4 },
    rend: { power: 1.5, cd: 3 },
    drain: { power: 1.85, cd: 3 },
    sunder: { power: 2.05, cd: 3 },
    ward: { power: 1, cd: 4 },
    surge: { power: 1, cd: 3 },
    riposte: { power: 1, cd: 5 },
    gamble: { power: 3, cd: 5 },
};
const kitOf = (kinds) => kinds.map((k, i) => ({ id: `${k}${i}`, kind: k, ...KIND[k], defensive: k === "ward" || k === "riposte" }));

// ── ONE BOUT ─────────────────────────────────────────────────────────────────────────────────────────────────
function bout({ myLevel, myGear, myFortune, foeVigour, foeMight, foeGear, foeFortune, kinds, clashMult = 1, skillBias = 0.8 }) {
    const maxHp = arenaVigour(myLevel, myGear);
    const might = arenaMight(myLevel, myGear);
    const kit = kitOf(kinds);
    const cd = {};
    const under = underdogEdge(myGear, foeGear);
    const myCrit = critFor(myFortune), foeCrit = critFor(foeFortune);

    let hp = maxHp, foeHp = foeVigour, shield = 0, surge = 0, riposte = 0, sunder = 0;
    let bleed = null, beat = 0, items = 2;

    while (hp > 0 && foeHp > 0 && beat < 60) {
        beat += 1;
        // ── YOUR BEAT ────────────────────────────────────────────────────────────────────────────────────
        // Wards and ripostes are FREE: arena.js resolves them and returns with the beat still yours. An honest
        // player therefore braces the moment it is ready and THEN acts, which is the strongest line available
        // and so the right one to measure. (They stay in the their-beat block below too, for a bout where the
        // player waits for the telegraph instead — whichever comes first puts it on cooldown.)
        for (const a of kit) {
            if (cd[a.id] > 0 || !FREE_KINDS.has(a.kind)) continue;
            cd[a.id] = a.cd;
            if (a.kind === "riposte") riposte = RIPOSTE_SHARE;
            else shield = Math.min(Math.round(maxHp * SHIELD_CAP), shield + Math.round(maxHp * WARD_SOAK));
        }
        const ready = kit.filter((a) => !(cd[a.id] > 0) && !FREE_KINDS.has(a.kind));
        const useSkill = ready.length && Math.random() < skillBias;
        // Drink when badly hurt and there is nothing better to do — an honest player would.
        if (hp < maxHp * 0.3 && items > 0 && !useSkill) {
            items -= 1;
            hp = Math.min(maxHp, hp + Math.round(maxHp * 0.25));
        } else {
            const ab = useSkill ? ready[Math.floor(Math.random() * ready.length)] : null;
            let power = ab ? ab.power : 1;
            let hits = ab?.hits || 1;
            let pierce = 1, gradeAtk = ATTACK;
            if (ab) {
                cd[ab.id] = ab.cd;
                if (ab.kind === "surge") { surge = SURGE_SWINGS; power = 0; }
                if (ab.kind === "execute" && foeHp <= foeVigour * EXECUTE_UNDER) power *= EXECUTE_MULT;
                if (ab.kind === "gamble") power = Math.random() < 0.5 ? power * 2 : 0;
                if (ab.kind === "strike") gradeAtk = 1 + (ATTACK - 1) * 1.45;
                if (ab.kind === "spell") { pierce = 0.6; power *= 0.88; }
            }
            const sMult = surge > 0 ? SURGE_MULT : 1;
            if (surge > 0) surge -= 1;
            const guard = foeGrade(foeGear).def * pierce * (sunder > 0 ? 1 - SUNDER_CUT : 1);
            let dmg = 0;
            for (let i = 0; i < hits && power > 0; i += 1) {
                const c = Math.random() < myCrit;
                const raw = hit(might * SWING) * gradeAtk * power * sMult * clashMult * under * (c ? CRIT_MULT : 1);
                dmg += Math.max(1, Math.round(raw - raw * guard));
            }
            foeHp = Math.max(0, foeHp - dmg);
            if (ab?.kind === "drain" && dmg > 0) hp = Math.min(maxHp, hp + Math.round(dmg * DRAIN_SHARE));
            if (ab?.kind === "rend" && dmg > 0) {
                const per = Math.max(1, Math.round(foeVigour * REND_PER_TURN));
                const stacks = Math.min(REND_MAX_STACKS, (bleed?.stacks || 0) + 1);
                bleed = { turns: REND_TURNS, stacks, dmg: per * stacks };
            }
            if (ab?.kind === "sunder") sunder = SUNDER_TURNS;
        }
        if (foeHp <= 0) break;

        // ── THEIR BEAT ───────────────────────────────────────────────────────────────────────────────────
        // A ward or riposte is played on their beat and does not cost you your swing.
        const def = kit.filter((a) => a.defensive && !(cd[a.id] > 0));
        if (def.length && Math.random() < 0.6) {
            const d = def[0];
            cd[d.id] = d.cd;
            if (d.kind === "riposte") riposte = RIPOSTE_SHARE;
            else shield = Math.min(Math.round(maxHp * SHIELD_CAP), shield + Math.round(maxHp * WARD_SOAK));
        }
        const fg = foeGrade(foeGear);
        const theirPower = Math.random() < AI_ABILITY_CHANCE ? 2.1 : 1;
        const fCrit = Math.random() < foeCrit;
        const raw = Math.max(1, Math.round(hit(foeMight * SWING * PUNCH) * fg.atk * theirPower * (1 / clashMult) * (fCrit ? CRIT_MULT : 1)));
        const blocked = Math.round(raw * BLOCK);
        let through = Math.max(0, raw - blocked);
        if (shield > 0) { const s = Math.min(shield, through); shield -= s; through -= s; }
        hp = Math.max(0, hp - through);
        if (riposte > 0 && through > 0) { foeHp = Math.max(0, foeHp - Math.max(1, Math.round(through * riposte))); riposte = 0; }
        if (bleed?.turns > 0) {
            foeHp = Math.max(0, foeHp - bleed.dmg);
            bleed.turns -= 1;
            if (bleed.turns <= 0) bleed = null;
        }
        if (sunder > 0) sunder -= 1;
        for (const k of Object.keys(cd)) cd[k] = Math.max(0, cd[k] - 1);
    }
    return { won: foeHp <= 0 && hp > 0, beats: beat };
}

const RUNS = Number(process.argv[2]) || 3000;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

// A representative mid-game member: level 30, 140 gear, some fortune.
const ME = { myLevel: 30, myGear: 140, myFortune: 30 };
const MIXED = ["strike", "spell", "ward", "surge"];

console.log(`\n=== 1. SKILL KIND PARITY (pure kit of 4, vs a level-30/140-gear mirror, ${RUNS} bouts) ===`);
console.log("kind       win%     beats   verdict");
const parity = [];
for (const k of Object.keys(KIND)) {
    let w = 0, b = 0;
    for (let i = 0; i < RUNS; i += 1) {
        const r = bout({ ...ME, kinds: [k, k, k, k], foeVigour: arenaVigour(30, 140), foeMight: arenaMight(30, 140), foeGear: 140, foeFortune: 30 });
        w += r.won ? 1 : 0; b += r.beats;
    }
    parity.push({ k, win: w / RUNS, beats: b / RUNS });
}
const median = [...parity].sort((a, b) => a.win - b.win)[Math.floor(parity.length / 2)].win;
for (const p of parity.sort((a, b) => b.win - a.win)) {
    const d = p.win - median;
    const verdict = Math.abs(d) < 0.06 ? "ok" : d > 0 ? `STRONG (+${pct(d)} vs median)` : `WEAK (${pct(d)} vs median)`;
    console.log(`${p.k.padEnd(10)} ${pct(p.win).padStart(6)}  ${p.beats.toFixed(1).padStart(6)}   ${verdict}`);
}

console.log(`\n=== 1b. ONE OF EACH KIND + 3 STRIKES (how a kind actually gets played, ${RUNS} bouts) ===`);
console.log("kind       win%     beats");
const mixres = [];
for (const k of Object.keys(KIND)) {
    let w = 0, b = 0;
    for (let i = 0; i < RUNS; i += 1) {
        const r = bout({ ...ME, kinds: [k, "strike", "strike", "strike"], foeVigour: arenaVigour(30, 140), foeMight: arenaMight(30, 140), foeGear: 140, foeFortune: 30 });
        w += r.won ? 1 : 0; b += r.beats;
    }
    mixres.push({ k, win: w / RUNS, beats: b / RUNS });
}
for (const p of mixres.sort((a, b) => b.win - a.win)) console.log(`${p.k.padEnd(10)} ${pct(p.win).padStart(6)}  ${p.beats.toFixed(1).padStart(6)}`);

console.log(`\n=== 2. THE GAUNTLET CURVE (mixed kit, ${RUNS} bouts a tier) ===`);
console.log("tier   npcPower  win%     beats");
for (const t of [1, 3, 5, 8, 11, 14, 17, 20, 25, 30, 40, 50]) {
    const gp = npcPower(t);
    let w = 0, b = 0;
    for (let i = 0; i < RUNS; i += 1) {
        const r = bout({
            ...ME, kinds: MIXED,
            foeVigour: Math.round(70 + gp * 1.15), foeMight: Math.round(9 + gp * 0.115),
            foeGear: gp, foeFortune: Math.round(gp * 0.12),
        });
        w += r.won ? 1 : 0; b += r.beats;
    }
    console.log(`${String(t).padStart(4)}   ${String(gp).padStart(8)}  ${pct(w / RUNS).padStart(6)}  ${(b / RUNS).toFixed(1).padStart(6)}`);
}

console.log(`\n=== 3. MEMBER vs MEMBER (mixed kit, ${RUNS} bouts) ===`);
console.log("matchup            win%     beats");
for (const [label, foe] of [
    ["even            ", { l: 30, g: 140 }],
    ["+25% gear       ", { l: 32, g: 175 }],
    ["+60% gear       ", { l: 36, g: 224 }],
    ["big gap (+115%) ", { l: 40, g: 300 }],
    ["weaker (-30%)   ", { l: 26, g: 98 }],
]) {
    let w = 0, b = 0;
    for (let i = 0; i < RUNS; i += 1) {
        const r = bout({
            ...ME, kinds: MIXED,
            foeVigour: arenaVigour(foe.l, foe.g), foeMight: arenaMight(foe.l, foe.g),
            foeGear: foe.g, foeFortune: 30,
        });
        w += r.won ? 1 : 0; b += r.beats;
    }
    console.log(`${label}  ${pct(w / RUNS).padStart(6)}  ${(b / RUNS).toFixed(1).padStart(6)}`);
}
console.log("");
