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
    KENO_PICKS, KENO_PAYS, kenoChance, kenoRtp,
    PRIZE_CHANCE, PRIZE_SHELF, CASINO_PETS, MAX_PERKS, perkedRtp, REFUND_CHANCE,
} from "../src/lib/marketplace/casino.js";
import { readFileSync } from "node:fs";
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

    // ── WHAT THIS FLOOR IS ACTUALLY FOR ──────────────────────────────────────────────────────────────
    // A dead screen. The sentence that has always sat here says it exactly: "a machine that pays one pull in
    // twenty is technically generous and reads as broken" — one in twenty, 5%. The NUMBER next to it was 35%,
    // which is seven times stricter than its own stated reason, and it was never a designed floor: it was a
    // description of the tables as they used to be, when every cabinet bought its hit rate with pairs of its
    // commonest symbol and 60-74% of pulls "paid".
    //
    // Those pairs are gone. Luke: "its lame to get .2 to 1.2 very lame" — no winning combination anywhere on
    // this floor now pays less than the stake, and on three reels nothing frequent enough to hold a 35% hit
    // rate can be afforded at 2x inside an 88% return. So 35% is no longer a bar the tables fail to clear; it
    // is a bar that describes a design we deliberately removed, and leaving it there makes this gate red on
    // every future run without telling anybody anything true.
    //
    // 10% is the honest version of the original sentence — double the one-in-twenty it names as broken. The
    // Vault sits closest to it at 11.8% and that is the machine working: its own blurb is "Rarely opens.
    // Opens enormously", it is the tightest cabinet on the floor on purpose, and the bar has to leave room
    // for the design rather than forbid it. WHAT KEEPS THE
    // SCREEN ALIVE between wins is no longer a dribble that hands back less than it took — it is the nudge,
    // the free pulls, the banks filling and the Pot climbing, all of which fire on pulls that pay nothing.
    // If those are ever cut, this floor is not the check that should be relaxed to compensate.
    const floor = m.scatter ? 0.08 : 0.10;
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
console.log(`\nTHE FIVE TOGETHER`);
console.log(`  return spread    ${pct(spreadRtp)}  (they should be close — none of them is the smart pick)`);
console.log(`  hit-rate spread  ${pct(Math.max(...hits) - Math.min(...hits))}`
    + `  — loosest pays ${(Math.max(...hits) / Math.max(0.0001, Math.min(...hits))).toFixed(2)}x as often as tightest (that IS the choice)`);
if (spreadRtp > 0.05) {
    problems.push(`the slots return between ${pct(Math.min(...Object.values(slotRtps)))} and ${pct(Math.max(...Object.values(slotRtps)))} — one cabinet is strictly better, which makes the others traps`);
}
// ── DIFFERENCE IS A RATIO NOW, NOT A GAP ────────────────────────────────────────────────────────────────
// This wanted 15 PERCENTAGE POINTS between the loosest and tightest cabinet, which was the right shape of
// question when hit rates ran 60-74% and the wrong one now they run 12-21%: the entire range is narrower
// than the old threshold, so an absolute gap can no longer express "these are different machines" no matter
// how different they are. The Vault pays on 11.8% of pulls and The Harvest on 21.4% — The Harvest pays
// nearly twice as often, which is a completely different machine to sit at, and the old test called it a
// paint job. A ratio says the thing the gap used to say, at any scale of hit rate.
const loosest = Math.max(...hits);
const tightest = Math.min(...hits);
if (loosest / Math.max(0.0001, tightest) < 1.5) {
    problems.push(`the loosest cabinet pays only ${(loosest / Math.max(0.0001, tightest)).toFixed(2)}x as often as the tightest — they are one machine in five paint jobs, so four of them are not worth the floor space`);
}

const rtp = slotRtps.slot;   // the floor's headline number, for the closing line and the perk maths below

// ── KENO ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Hypergeometric, computed with factorials. Five-of-five is rare enough that no simulation would price it
// honestly without millions of runs, which is the whole argument for doing the arithmetic.
console.log("\nKENO");
let kenoTotal = 0;
// How often a ticket pays NOTHING. The Croupier's Cat refunds a share of exactly those, so the perked table
// below has to be handed this number — without it the gate prices a refund of zero while the floor pays one,
// which is the one failure every comment in this file is written to prevent.
let kenoLoss = 0;
for (let k = 0; k <= KENO_PICKS; k += 1) {
    const p = kenoChance(k);
    kenoTotal += p;
    const pay = KENO_PAYS[k] || 0;
    if (pay <= 0) kenoLoss += p;
    const odds = p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "never";
    console.log(`  ${k} hit${k === 1 ? " " : "s"}  ${pct(p).padStart(8)}  ${odds.padStart(12)}  pays ${String(pay).padStart(4)}x  ->  ${pct(p * pay)}`);
}
const kr = kenoRtp();
console.log(`  return       ${pct(kr)}  in CHIPS`);
if (Math.abs(kenoTotal - 1) > 1e-6) problems.push(`keno's outcome probabilities sum to ${kenoTotal.toFixed(6)}, not 1 — the maths is wrong`);

// ── KENO IS NOT A GOLD GAME ANY MORE, SO IT IS NOT UNDER THE GOLD CEILING ────────────────────────────────────
// It used to be checked against RTP_CEILING like the three-reel cabinets, and that was right while it paid
// gold. It pays CHIPS now (Luke: "convert blackjack, keno and bingo to give out chips, not gold"), which puts
// it on the same floor as the five-reel machines — and check:slot5 has the long argument for why the LEVEL of
// a chip floor is not a thing a gate should enforce. Luke, on watching me do exactly that: "are you trying to
// balance the slots or what, don't do that please... when you do that you really kind of make everything
// boring." Chips never convert back to gold, so 100% was always an arbitrary constant to defend.
//
// What IS worth failing the build over is keno being a different deal from the machines standing next to it —
// a cabinet nobody should play, or one everybody should. So the band is wide, and it is centred on where the
// five-reel floor actually sits (97.6% to 108.5% when this was written), not on a round number.
const CHIP_FLOOR_LO = 0.90;
const CHIP_FLOOR_HI = 1.12;
if (kr < CHIP_FLOOR_LO) {
    problems.push(`keno returns ${pct(kr)} in chips while the five-reel floor pays 97-108% — it is the one cabinet nobody should sit at`);
}
if (kr > CHIP_FLOOR_HI) {
    problems.push(`keno returns ${pct(kr)} in chips, well above the five-reel floor — it is the smart pick, which makes the other cabinets decorative`);
}

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
        : k.lossRefund ? `${pct(k.lossRefund)} of a losing keno ticket back (paid as ${pct(Math.min(1, k.lossRefund / REFUND_CHANCE))} of the stake, ${pct(REFUND_CHANCE)} of losses)`
        : k.prizeChance ? `+${pct(k.prizeChance)} prize chance`
        : k.prizeTierUp ? "prizes roll from a better shelf" : "nothing";
    console.log(`  ${pet.name.padEnd(18)} ${String(pet.rarity).padEnd(10)} 1 in ${String(Math.round(1 / pet.casinoChance).toLocaleString()).padStart(6)} plays   ${what}`);
}
console.log(`  budget       ${pct(MAX_PERKS.freePlay)} free plays, ${pct(MAX_PERKS.lossRefund)} keno refund, +${pct(MAX_PERKS.prizeChance)} prizes${MAX_PERKS.prizeTierUp ? ", better shelf" : ""}`);

// Keno is deliberately absent from this list. The ceiling below is the GOLD ceiling and these are the gold
// machines; a chip cabinet in here would be measured against a rule that does not apply to it, and the only
// way to satisfy that rule would be to nerf a game for failing a test meant for a different currency. What
// the pets do to keno is printed underneath instead, because it is worth knowing and not worth failing on.
const perked = [
    ...Object.values(SLOT_MACHINES).map((m) => ({ name: m.label, r: perkedRtp(slotRtps[m.id]) })),
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
{
    // Printed, not gated — see the note on the list above. A chip cabinet over 100% is not a money printer,
    // because there is no path from chips back to gold; it is a cabinet that hands out slightly more tickets.
    const kp = perkedRtp(kr, MAX_PERKS, kenoLoss);
    console.log(`  ${"keno (chips)".padEnd(22)} ${pct(kp).padStart(7)}   ${`${pct(kp - kr)} from the pets`.padStart(14)}`);
}

// ── AND EVERY CABINET HAS A VOICE AND A TUNE ────────────────────────────────────────────────────────────────
// Each machine on the floor gets its own sound palette (VOICES in casino-audio.js) and its own music loop
// (VIBES in SceneMusic.js), keyed by the machine id. Miss one and there is no error anywhere: the sound kit
// silently falls back to The Hunt's scale and the music silently falls back to the TOWN loop — so a new
// cabinet would play the town's folk tune on the casino floor and nobody would find out except a member.
//
// Read out of the source rather than imported, because all three files are "use client" React modules that
// pull in Web Audio at import time and cannot be loaded here. A regex over a literal is normally the wrong
// tool; it is the right one when the alternative is no check at all.
{
    const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
    const ids = [...read("../src/components/CasinoClient.js")
        .split("const MACHINES = [")[1].split("];")[0]
        .matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
    const voices = new Set([...read("../src/components/casino/casino-audio.js")
        .split("const VOICES = {")[1].split("\n};")[0]
        .matchAll(/^\s{4}([a-z0-9]+):\s*\{/gm)].map((m) => m[1]));
    const vibes = new Set([...read("../src/components/SceneMusic.js")
        .split("const VIBES = {")[1].split("\n};")[0]
        .matchAll(/^\s{4}([a-z0-9]+):\s*\{/gm)].map((m) => m[1]));

    // THE COUNTER IS NOT A GAME. It is on the floor and in MACHINES because you walk to it, but it has no
    // reels, no sounds of its own and no tune — it keeps the floor's. Everything else in that list is a
    // cabinet and must have both.
    const NOT_A_GAME = new Set(["store"]);
    if (!ids.length) problems.push("could not read MACHINES out of CasinoClient.js — this check has gone blind");
    const games = ids.filter((id) => !NOT_A_GAME.has(id));
    for (const id of games) {
        if (!voices.has(id)) problems.push(`${id} has no entry in VOICES — it would play The Hunt's sounds`);
        if (!vibes.has(id)) problems.push(`${id} has no entry in VIBES — it would play the TOWN music`);
    }
    if (games.length && games.every((i) => voices.has(i) && vibes.has(i))) {
        console.log(`\n  all ${games.length} cabinets have their own voice and their own tune`);
    }
}

// ── THE VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
    console.log(`\ncheck:casino FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log("\nThe tables in casino.js are the only place these numbers live. Change them there.");
    process.exit(1);
}
console.log(`\ncheck:casino — every machine keeps a house edge. The slot returns ${pct(rtp)}.`);
