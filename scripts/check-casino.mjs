// ── CAN A MACHINE MINT GOLD? ─────────────────────────────────────────────────────────────────────────────────
// A payout table is the one kind of content in this game that can create currency out of nothing, and this
// codebase has already paid for that lesson once: awardXp paid gold 1:1 with points, and a repeatable caller
// that forgot `gold: 0` was a money printer nobody noticed until the ledger did.
//
// A slot machine is that bug with a lever on it, so the odds do not get to be checked by eye. This reads the
// SAME tables the game pays from — not a copy, the actual export — enumerates every outcome exactly, and
// fails if any machine returns more than RTP_CEILING.
//
// Exact, not sampled. Three reels of six symbols is 216 combinations; there is no reason to estimate a number
// that can be computed.
//
// Run:  node scripts/check-casino.mjs   (or npm run check:casino)
import {
    SLOT_MACHINES, slotHitRate, RTP_CEILING, RTP_TARGET, slotPayout, slotRtp,
    WHEEL, WHEEL_BETS, wheelRtp, KENO_PICKS, KENO_PAYS, kenoChance, kenoRtp,
    PRIZE_CHANCE, PRIZE_SHELF, CASINO_PETS, MAX_PERKS, perkedRtp, REFUND_CHANCE,
} from "../src/lib/marketplace/casino.js";
import { SLOT_BONUSES, bonusEv } from "../src/lib/marketplace/slot-bonus.js";

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const problems = [];

// ── THE SLOTS ───────────────────────────────────────────────────────────────────────────────────────────────
// Every cabinet, each enumerated over all of its combinations exactly. They are meant to differ in VOLATILITY and not
// in value: a floor where one machine is simply better is a floor with two traps on it, and nobody would
// ever find out which was which by playing.
const slotRtps = {};
for (const m of Object.values(SLOT_MACHINES)) {
    const syms = m.symbols;
    const total = syms.reduce((n, x) => n + x.weight, 0);
    const rtp = slotRtp(m.id);
    const hitRate = slotHitRate(m.id);
    slotRtps[m.id] = rtp;   // paytable only; the real number is set below once its features are priced

    console.log(`\n${m.label.toUpperCase()}  —  ${m.blurb}`);
    console.log(`  symbols      ${syms.length}, ${total} weight across the reel`);
    console.log(`  combinations ${syms.length ** 3} (enumerated exactly, not sampled)`);
    console.log(`  return       ${pct(rtp)}   target ${pct(RTP_TARGET)}   ceiling ${pct(RTP_CEILING)}`);
    console.log(`  house edge   ${pct(1 - rtp)}`);
    console.log(`  hit rate     ${pct(hitRate)} of pulls pay something`);

    // ── AND WHAT THE FEATURES COST ───────────────────────────────────────────────────────────────────────
    // A bonus takes its return OUT of the base game — the ceiling does not move because a machine grew a
    // feature. So the paytable's number is only half the machine, and this is the other half: each feature
    // priced exactly, added on, and the total checked against the ceiling below.
    //
    // A feature whose cost cannot be computed cannot ship, because the gate would be checking arithmetic
    // that no longer describes the machine.
    const ev = bonusEv(m.id, m, rtp, hitRate);
    const withBonuses = rtp + ev.total;
    
    if ((SLOT_BONUSES[m.id] || []).length) {
        console.log("  bonuses");
        for (const b of SLOT_BONUSES[m.id]) {
            const cost = ev[b.id] || 0;
            console.log(`    ${b.label.padEnd(18)} ${(cost >= 0 ? "+" : "") + pct(cost)}   ${b.blurb}`);
        }
        console.log(`  paytable     ${pct(rtp)}  +  features ${pct(ev.total)}  =  ${pct(withBonuses)}`);
    }

    slotRtps[m.id] = withBonuses;
    if (withBonuses > RTP_CEILING) {
        problems.push(`${m.label} returns ${pct(withBonuses)} with its features, above the ${pct(RTP_CEILING)} ceiling — it is a money printer`);
    }
    if (withBonuses >= 1) {
        problems.push(`${m.label} returns ${pct(withBonuses)} — every pull is free money and the Den's economy is over`);
    }
    // A machine whose features are worth almost nothing has decoration rather than features. The point of
    // funding them out of the paytable is that they carry a real share of what the machine pays.
    if ((SLOT_BONUSES[m.id] || []).length && Math.abs(ev.total) < 0.01 && ev.total <= 0) {
        problems.push(`${m.label}'s features are worth ${pct(ev.total)} — they are decoration, not features`);
    }

    // ── WHERE THE MONEY GOES ─────────────────────────────────────────────────────────────────────────────
    // Which lines carry the return, so a table can be re-tuned with the consequence visible. A machine whose
    // whole return sits on one jackpot FEELS like a coin shredder however good the average is.
    const contrib = [];
    for (const a of syms) for (const b of syms) for (const c of syms) {
        const prob = (a.weight / total) * (b.weight / total) * (c.weight / total);
        const pay = slotPayout([a.id, b.id, c.id], m.id);
        if (pay > 0) contrib.push({ line: [a.id, b.id, c.id], p: prob, ret: prob * pay });
    }
    const byKind = {};
    for (const c of contrib) {
        const trip = c.line.every((x) => x === c.line[0]);
        const kind = trip ? `three ${c.line[0]}` : m.scatter && c.line.includes(m.scatter.id) ? "scattered stars" : "a pair";
        byKind[kind] = (byKind[kind] || 0) + c.ret;
    }
    console.log("  what carries the return");
    for (const [kind, ret] of Object.entries(byKind).sort((x, y) => y[1] - x[1])) {
        console.log(`    ${kind.padEnd(16)} ${pct(ret).padStart(8)}  (${pct(ret / rtp)} of everything paid)`);
    }

    // A machine that pays one pull in twenty is technically generous and reads as broken. The VOLATILE one
    // is allowed a thinner floor than the others — that is what it is for — but not a dead screen.
    const floor = m.scatter ? 0.2 : 0.35;
    if (hitRate < floor) {
        problems.push(`${m.label} pays on only ${pct(hitRate)} of pulls (floor ${pct(floor)}) — that reads as a broken machine`);
    }

    // The jackpot may carry a volatile machine, which is the whole idea of one — but on a machine WITHOUT a
    // scatter to keep the screen alive, a return that lives on the top prize is a shredder with a rumour
    // attached.
    const jackpot = byKind[`three ${syms[0].id}`] || 0;
    if (!m.scatter && jackpot / rtp > 0.5) {
        problems.push(`${pct(jackpot / rtp)} of ${m.label}'s return sits on the jackpot alone — a session will feel like nothing but losses`);
    }
}

// ── AND ARE THEY ACTUALLY DIFFERENT? ─────────────────────────────────────────────────────────────────────────
// The reason for five cabinets is five SHAPES, not five paint jobs. If their returns and hit rates all
// converge, the extra ones are decoration and should be deleted rather than shipped.
const spreadRtp = Math.max(...Object.values(slotRtps)) - Math.min(...Object.values(slotRtps));
const hits = Object.values(SLOT_MACHINES).map((m) => slotHitRate(m.id));
console.log(`\nTHE THREE TOGETHER`);
console.log(`  return spread    ${pct(spreadRtp)}  (they should be close — none of them is the smart pick)`);
console.log(`  hit-rate spread  ${pct(Math.max(...hits) - Math.min(...hits))}  (they should be far apart — that IS the choice)`);
if (spreadRtp > 0.05) {
    problems.push(`the slots return between ${pct(Math.min(...Object.values(slotRtps)))} and ${pct(Math.max(...Object.values(slotRtps)))} — one cabinet is strictly better, which makes the others traps`);
}
if (Math.max(...hits) - Math.min(...hits) < 0.15) {
    problems.push(`all three slots pay on about the same share of pulls — they are one machine in three paint jobs, so two of them are not worth the floor space`);
}

const rtp = slotRtps.slot;   // the floor's headline number, for the closing line and the perk maths below

// ── THE WHEEL ────────────────────────────────────────────────────────────────────────────────────────────────
// Every bet enumerated over all twenty pockets. They are meant to return the SAME amount as each other — a
// wheel with a smart bet on it is a wheel with a trap bet on it.
console.log("\nTHE WHEEL");
const wheelReturns = [];
for (const [id, bet] of Object.entries(WHEEL_BETS)) {
    const r = wheelRtp(id, 0);
    wheelReturns.push(r);
    const wins = WHEEL.filter((seg) => bet.hits(seg, 0)).length;
    console.log(`  ${bet.label.padEnd(11)} pays ${String(bet.pays).padStart(3)}x on ${String(wins).padStart(2)}/${WHEEL.length} pockets  ->  ${pct(r)}`);
    if (r > RTP_CEILING) problems.push(`the wheel's ${bet.label} bet returns ${pct(r)}, above the ${pct(RTP_CEILING)} ceiling`);
}
const spread = Math.max(...wheelReturns) - Math.min(...wheelReturns);
console.log(`  spread between bets ${pct(spread)}`);
if (spread > 0.02) {
    problems.push(`the wheel's bets return between ${pct(Math.min(...wheelReturns))} and ${pct(Math.max(...wheelReturns))} — one of them is strictly better, which makes the rest traps`);
}

// ── KENO ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Hypergeometric, computed with factorials. Five-of-five is rare enough that no simulation would price it
// honestly without millions of runs, which is the whole argument for doing the arithmetic.
console.log("\nKENO");
let kenoTotal = 0;
for (let k = 0; k <= KENO_PICKS; k += 1) {
    const p = kenoChance(k);
    kenoTotal += p;
    const pay = KENO_PAYS[k] || 0;
    const odds = p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "never";
    console.log(`  ${k} hit${k === 1 ? " " : "s"}  ${pct(p).padStart(8)}  ${odds.padStart(12)}  pays ${String(pay).padStart(4)}x  ->  ${pct(p * pay)}`);
}
const kr = kenoRtp();
console.log(`  return       ${pct(kr)}`);
if (Math.abs(kenoTotal - 1) > 1e-6) problems.push(`keno's outcome probabilities sum to ${kenoTotal.toFixed(6)}, not 1 — the maths is wrong`);
if (kr > RTP_CEILING) problems.push(`keno returns ${pct(kr)}, above the ${pct(RTP_CEILING)} ceiling`);

// ── PRIZES, WHICH ARE NOT IN THE RETURN ──────────────────────────────────────────────────────────────────────
// Said out loud rather than folded into the RTP. The gold maths above is exact and provable; a chest is worth
// whatever a chest is worth to whoever opened it, and rolling that into a percentage would produce a number
// that looks rigorous and is invented.
//
// What IS checked is that the rate stays small enough to be a surprise rather than a strategy — a floor where
// the prizes are the reason to play is a floor whose gold economy no longer matters.
console.log("\nPRIZES (on top of the return, not counted in it)");
console.log(`  any play      ${pct(PRIZE_CHANCE)}  — roughly 1 in ${Math.round(1 / PRIZE_CHANCE)}`);
console.log(`  a jackpot     certain, from a better shelf`);
console.log(`  the shelf     ${PRIZE_SHELF.map((p) => p.kind).join(", ")}`);
if (PRIZE_CHANCE > 0.05) {
    problems.push(`prizes land on ${pct(PRIZE_CHANCE)} of plays — that is often enough to be the reason to play, which makes the gold economy decorative`);
}


// ── AND NOW WITH EVERY PET ON THE FLOOR ──────────────────────────────────────────────────────────────────────
// The five casino pets are the only content in the game that edits a payout table from outside it, which makes
// them the likeliest way this floor ever turns into a money printer: each perk is small, none of them looks
// dangerous alone, and nobody adding the sixth one would think to re-check the fifth.
//
// So the ceiling is enforced against the WORST case — one player holding all five, on the bet each machine
// pays the most back on — using perkedRtp, the same function the floor prices with.
console.log("\nWITH ALL FIVE PETS OWNED (the worst case the ceiling has to survive)");
for (const pet of CASINO_PETS) {
    const k = pet.casinoPerk;
    const what = k.freePlay ? `${pct(k.freePlay)} of plays free`
        : k.wheelRefund ? `${pct(k.wheelRefund)} of a losing wheel spin back (paid as ${pct(Math.min(1, k.wheelRefund / REFUND_CHANCE))} of the stake, ${pct(REFUND_CHANCE)} of losses)`
        : k.prizeChance ? `+${pct(k.prizeChance)} prize chance`
        : k.prizeTierUp ? "prizes roll from a better shelf" : "nothing";
    console.log(`  ${pet.name.padEnd(18)} ${String(pet.rarity).padEnd(10)} 1 in ${String(Math.round(1 / pet.casinoChance).toLocaleString()).padStart(6)} plays   ${what}`);
}
console.log(`  budget       ${pct(MAX_PERKS.freePlay)} free plays, ${pct(MAX_PERKS.wheelRefund)} wheel refund, +${pct(MAX_PERKS.prizeChance)} prizes${MAX_PERKS.prizeTierUp ? ", better shelf" : ""}`);

const perked = [
    ...Object.values(SLOT_MACHINES).map((m) => ({ name: m.label, r: perkedRtp(slotRtps[m.id]) })),
    { name: "keno", r: perkedRtp(kr) },
    ...Object.entries(WHEEL_BETS).map(([id, bet]) => {
        // Worst bet FIRST: the refund only pays on a loss, so the long shots carry the most of it.
        const loss = 1 - WHEEL.filter((seg) => bet.hits(seg, 0)).length / WHEEL.length;
        return { name: `the wheel, ${bet.label}`, r: perkedRtp(wheelRtp(id, 0), MAX_PERKS, loss) };
    }),
].sort((a, b) => b.r - a.r);

console.log("");
for (const m of perked) {
    const head = RTP_CEILING - m.r;
    console.log(`  ${m.name.padEnd(22)} ${pct(m.r).padStart(7)}   ${(head >= 0 ? `${pct(head)} under` : `${pct(-head)} OVER`).padStart(14)} the ceiling`);
    if (m.r > RTP_CEILING) {
        problems.push(`with all five pets, ${m.name} returns ${pct(m.r)} — past the ${pct(RTP_CEILING)} ceiling. Lower a perk in collectibles.js or a payout in casino.js.`);
    }
    if (m.r >= 1) problems.push(`with all five pets, ${m.name} returns ${pct(m.r)} — that is a money printer with a lever on it`);
}

// ── THE VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
    console.log(`\ncheck:casino FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log("\nThe tables in casino.js are the only place these numbers live. Change them there.");
    process.exit(1);
}
console.log(`\ncheck:casino — every machine keeps a house edge. The slot returns ${pct(rtp)}.`);
