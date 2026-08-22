// ── SIX BONUSES, AND THE ONE RULE THAT GOVERNS ALL OF THEM ───────────────────────────────────────────────────
// A bonus TAKES ITS RETURN OUT OF THE BASE GAME. It cannot add to it. The ceiling does not move because a
// machine grew a feature, so every one of these is funded by the paytable that pays for it — which is also
// what makes a bonus feel like anything: dead pulls are the price of the thing you are waiting for, and a
// feature bolted on top of an unchanged paytable is just a machine that got more generous.
//
// So every bonus here has an EXACT expected value, computed below and added to the enumerated paytable by
// check:casino. A feature whose cost cannot be computed is a feature that cannot ship, because the gate would
// be checking arithmetic that no longer describes the machine.
//
// This file is pure — no gold, no database, no randomness it does not receive — for the same reason
// arena-engine and blackjack-kit are: the check script has to price two hundred and sixteen combinations plus
// six features without a database on the other end.
//
// TWO OF THEM ARE STATEFUL (the Tray and Moonstruck) and one spans requests (free pulls), so the caller keeps
// a small meter per player per machine and hands it in. The shape is `{ tray, streak, freePulls, freeMult,
// pending }` and it is documented at `emptyMeter` below.

/** A meter that has never been played. Every field is in STAKE UNITS, never in gold — a player who changes
 *  stake mid-session must not be able to fill a tray at 25 and tip it out at 2,500. */
export const emptyMeter = () => ({ tray: 0, streak: 0, freePulls: 0, freeMult: 1, pending: 0 });

// ── THE TUNING ───────────────────────────────────────────────────────────────────────────────────────────────
// Every number a feature costs, in one place, so check:casino can price them and so re-tuning one does not
// mean reading six functions.
export const BONUS_TUNING = {
    // Wolf's Luck
    nudgeSymbol: 0,          // index into the machine's symbol list — its top symbol
    packPulls: 10,           // free pulls awarded by Pack Call
    packTrigger: "doubloon", // and what awards them
    // Den Fortune
    trayRate: 0.15,          // of the stake, into the tray, on every losing pull
    trayTip: "moon",         // the triple that tips it out
    // Moonrise
    freeSpins: 8,            // spins awarded by the Moonrise feature
    freeMult: 2,             // and what every win during them is multiplied by
    moonstruckStep: 0.02,    // added to the multiplier per dead pull
    moonstruckCap: 2,        // and where it stops
};

// ── WHAT EACH CABINET HAS ────────────────────────────────────────────────────────────────────────────────────
// Two each, and deliberately matched to what the machine already IS. The grinder gets a mechanic that rewards
// sitting there; the chase gets two that reward enduring nothing; the all-rounder gets the two features every
// slot player already knows. A bonus that fights its machine's volatility just blurs both.
export const SLOT_BONUSES = {
    slot: [
        { id: "nudge", label: "The Nudge", blurb: "Two wolves and a miss — the third reel goes again, free." },
        { id: "pack", label: "Pack Call", blurb: "Three doubloons calls the pack: ten free pulls." },
    ],
    slot2: [
        { id: "tray", label: "The Tray", blurb: "Every dead pull drops coins in the tray. Three moons tips it out." },
        { id: "gamble", label: "Double or Nothing", blurb: "One coin flip on any win. Exactly even money — the only fair bet on the floor." },
    ],
    slot3: [
        { id: "moonrise", label: "Moonrise", blurb: "Three stars: eight free spins, every win doubled." },
        { id: "moonstruck", label: "Moonstruck", blurb: "Every dead pull raises the multiplier on your next win." },
    ],
};

export const hasBonus = (machineId, id) => (SLOT_BONUSES[machineId] || []).some((b) => b.id === id);

// ── THE NUDGE ────────────────────────────────────────────────────────────────────────────────────────────────
// Exactly two of the top symbol, and the reel that missed goes again. Nothing else about the hand changes, so
// the only outcome it can create is the jackpot — the pair is already paid either way.
export function nudgeTarget(reels, machine) {
    const top = machine.symbols[0].id;
    const n = reels.filter((r) => r === top).length;
    if (n !== 2) return -1;
    return reels.findIndex((r) => r !== top);
}

/** Exact EV of the Nudge, as a multiple of the stake, per pull. */
export function nudgeEv(machine) {
    const total = machine.symbols.reduce((n, s) => n + s.weight, 0);
    const p = machine.symbols[0].weight / total;
    const top = machine.symbols[0].id;
    // Exactly two of the top symbol: three positions for the miss, and the miss is anything else.
    const pTwo = 3 * p * p * (1 - p);
    const gain = (machine.pays.three[top] || 0) - (machine.pays.two[top] || 0);
    return pTwo * p * gain;
}

// ── FREE PULLS ───────────────────────────────────────────────────────────────────────────────────────────────
// Pack Call and Moonrise are the same machinery with different numbers: a trigger banks N pulls that cost
// nothing, optionally at a multiplier. Neither RE-TRIGGERS — a feature that can award itself is a geometric
// series, and a geometric series is how a paytable stops having an exact answer.
export function freePullEv(machineId, machine, baseRtp, { pulls, mult = 1, trigger }) {
    const total = machine.symbols.reduce((n, s) => n + s.weight, 0);
    const sym = machine.symbols.find((s) => s.id === trigger);
    if (!sym) return 0;
    const pTriple = (sym.weight / total) ** 3;
    // ── A FREE PULL IS WORTH A PULL, NOT A PAYTABLE ──────────────────────────────────────────────────────
    // This priced free pulls at the bare paytable, and check:slot-bonus caught it by measuring: on Wolf's
    // Luck a free pull is worth 0.841 against a paytable of 0.814, because a free pull STILL GETS THE
    // NUDGE. Every feature that applies during a free pull has to be in the value of one.
    //
    // Moonstruck deliberately does not (it is inert during free spins) and the Tray belongs to a machine
    // with no free pulls at all, so the Nudge is the whole of the correction today — but it is written as
    // "what a pull on this machine is worth" rather than "plus the nudge", so the next feature that applies
    // during free pulls is priced by construction instead of by somebody remembering.
    const perPull = baseRtp + (hasBonus(machineId, "nudge") ? nudgeEv(machine) : 0);
    return pTriple * pulls * mult * perPull;
}

// ── THE TRAY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Coins fall in on every losing pull and come out on a moon triple. In the steady state everything that goes
// in comes out, so the cost per pull is simply the rate times how often a pull loses — the tipping symbol
// changes the RHYTHM of the payout, not its size.
//
// The one caveat, said out loud because it flatters the number: a player who walks away with a full tray
// leaves it behind. The real return is therefore slightly BELOW this, never above, which is the safe
// direction for a ceiling to be wrong in.
export function trayEv(machine, hitRate) {
    return BONUS_TUNING.trayRate * (1 - hitRate);
}

// ── MOONSTRUCK ───────────────────────────────────────────────────────────────────────────────────────────────
// The multiplier climbs on every dead pull and empties into the next win. Wins are independent of how long
// you waited, so the extra return is just the average win multiplied by the average height of the meter when
// a win finally lands — and the run of losses before a win is geometric.
//
// Deliberately does NOT apply during free spins: two multipliers stacking is a number nobody priced.
export function moonstruckEv(machine, baseRtp, hitRate) {
    const p = Math.max(1e-9, hitRate);
    const steps = Math.floor((BONUS_TUNING.moonstruckCap - 1) / BONUS_TUNING.moonstruckStep);
    // E[min(L, steps)] for L geometric on the number of failures before the first success.
    let expected = 0;
    for (let k = 0; k < steps; k += 1) expected += (1 - p) ** (k + 1);
    return baseRtp * BONUS_TUNING.moonstruckStep * expected;
}

/** The multiplier a meter is currently worth. */
export const moonstruckMult = (streak) =>
    Math.min(BONUS_TUNING.moonstruckCap, 1 + streak * BONUS_TUNING.moonstruckStep);

// ── DOUBLE OR NOTHING ────────────────────────────────────────────────────────────────────────────────────────
// Exactly even money, which is the whole point of it: it is the only bet in the building with no edge on it,
// it costs the ceiling NOTHING because its expected value is precisely zero, and it is entirely the player's
// choice. A gamble feature at 48% would be the house taking a second bite of a win it already raked.
export const GAMBLE_WIN_CHANCE = 0.5;
export const gambleEv = () => 0;

/**
 * Everything the features cost this machine, per pull, as a multiple of the stake.
 * `baseRtp` and `hitRate` are the PAYTABLE's own numbers — features are priced against the machine before
 * any of them existed, which is what stops one feature's value being fed into another's.
 */
export function bonusEv(machineId, machine, baseRtp, hitRate) {
    const out = {};
    for (const b of SLOT_BONUSES[machineId] || []) {
        if (b.id === "nudge") out.nudge = nudgeEv(machine);
        else if (b.id === "pack") {
            out.pack = freePullEv(machineId, machine, baseRtp, { pulls: BONUS_TUNING.packPulls, trigger: BONUS_TUNING.packTrigger });
        } else if (b.id === "tray") out.tray = trayEv(machine, hitRate);
        else if (b.id === "gamble") out.gamble = gambleEv();
        else if (b.id === "moonrise") {
            out.moonrise = freePullEv(machineId, machine, baseRtp, { pulls: BONUS_TUNING.freeSpins, mult: BONUS_TUNING.freeMult, trigger: "star" });
        } else if (b.id === "moonstruck") out.moonstruck = moonstruckEv(machine, baseRtp, hitRate);
    }
    out.total = Object.values(out).reduce((n, v) => n + v, 0);
    return out;
}

// ── ONE PULL, WITH ITS FEATURES ──────────────────────────────────────────────────────────────────────────────
// Everything a bonus does to a single pull, in one pure function — because the alternative is this logic
// living inside spinSlot, where the only way to check it is to play a million real pulls against a real
// database for real gold.
//
// The EVs above are ARITHMETIC. This is what actually runs. check:slot-bonus plays millions of pulls through
// this exact function and compares the measured return against those numbers, which is the only version of
// the check worth having: a gate that prices one implementation while the floor runs another is a gate that
// passes right up until the money is gone.
//
// `meter` is MUTATED — it is the caller's row and the caller saves it. `rollSymbol` and `rng` are injected so
// the simulation is reproducible and so this file needs no randomness of its own.
export function applyBonuses({ machineId, machine, reels, meter, free, payout, rollSymbol }) {
    const out = { nudged: null, struck: 1, tipped: 0, awarded: null };

    // THE NUDGE — two of the top symbol and a miss: the reel that missed goes again. It can only ever turn a
    // pair that was already paid into the triple, which is why it needed no funding.
    if (hasBonus(machineId, "nudge")) {
        const i = nudgeTarget(reels, machine);
        if (i >= 0) {
            const before = reels[i];
            reels[i] = rollSymbol();
            out.nudged = { reel: i, from: before, to: reels[i], hit: reels[i] === machine.symbols[0].id };
        }
    }

    let mult = payout(reels);
    // A free pull carries whatever multiplier the feature that awarded it carries.
    if (free) mult *= meter.freeMult;

    // MOONSTRUCK — climbs on every dead pull, empties into the next win. Inert during free spins: two
    // multipliers stacking is a number nobody priced.
    if (hasBonus(machineId, "moonstruck") && !free) {
        if (mult > 0) {
            out.struck = moonstruckMult(meter.streak);
            mult *= out.struck;
            meter.streak = 0;
        } else {
            meter.streak += 1;
        }
    }

    // THE TRAY — fills on every dead pull, tips out on the tipping triple. The triple is no longer the
    // prize; it is what hands you the prize you have been filling all session.
    if (hasBonus(machineId, "tray")) {
        const tips = reels.every((r) => r === BONUS_TUNING.trayTip);
        if (mult <= 0) meter.tray += BONUS_TUNING.trayRate;
        if (tips && meter.tray > 0) {
            out.tipped = meter.tray;
            mult += out.tipped;
            meter.tray = 0;
        }
    }

    // TRIGGERS — only on a PAID pull. A feature that can award itself is a geometric series, and a geometric
    // series is how a paytable stops having an exact answer.
    if (!free) {
        if (hasBonus(machineId, "pack") && reels.every((r) => r === BONUS_TUNING.packTrigger)) {
            meter.freePulls += BONUS_TUNING.packPulls;
            meter.freeMult = 1;
            out.awarded = { id: "pack", pulls: BONUS_TUNING.packPulls, mult: 1 };
        } else if (hasBonus(machineId, "moonrise") && reels.every((r) => r === "star")) {
            meter.freePulls += BONUS_TUNING.freeSpins;
            meter.freeMult = BONUS_TUNING.freeMult;
            out.awarded = { id: "moonrise", pulls: BONUS_TUNING.freeSpins, mult: BONUS_TUNING.freeMult };
        }
    }

    out.mult = mult;
    return out;
}

// ── HOW PRECISELY CAN A MACHINE'S RETURN EVEN BE MEASURED? ───────────────────────────────────────────────────
// Moonrise pays 4,000x once in ninety-one thousand pulls. Over three million pulls that is about thirty hits
// with a standard deviation of five and a half — which is nearly a full point of RTP, from the jackpot alone,
// on a perfectly correct machine.
//
// So a simulation cannot be held to a fixed tolerance: a band tight enough to be meaningful on Den Fortune is
// tighter than Moonrise can physically be measured to, and the check would fail forever on a machine that is
// right. This returns the per-pull standard deviation of the paytable, so the check can set its band from
// what the machine actually is rather than from a number somebody picked.
export function slotSigma(machine, payout) {
    const total = machine.symbols.reduce((n, s) => n + s.weight, 0);
    let mean = 0;
    let sq = 0;
    for (const a of machine.symbols) {
        for (const b of machine.symbols) {
            for (const c of machine.symbols) {
                const p = (a.weight / total) * (b.weight / total) * (c.weight / total);
                const pay = payout([a.id, b.id, c.id]);
                mean += p * pay;
                sq += p * pay * pay;
            }
        }
    }
    return Math.sqrt(Math.max(0, sq - mean * mean));
}
