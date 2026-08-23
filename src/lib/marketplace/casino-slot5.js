// ── FIVE REELS, THREE ROWS, TWENTY LINES ─────────────────────────────────────────────────────────────────────
// The machines this replaces were three reels with one payline, and they were boring for a reason that took a
// measurement to see. Of every win a member saw on The Deep, 93.3% was EXACTLY 2x. On The Harvest 77%, The
// Menagerie 74%, The Hunt 63%. The top prize was one pull in 3,254 at best and one in 91,125 at worst — a
// number nobody will ever see. Luke: "I shouldnt get double my money for a jackpot. you have engineered the
// most boring slots ever." He was right, and the cause was structural rather than a bad paytable.
//
// On THREE reels, the only combinations frequent enough to pay often are the common symbols. Ban wins that pay
// back less than the stake — which was the correct call, "its lame to get .2 to 1.2" — and every affordable
// win collapses onto the 2x rung, because that is the only rung left. The rule was right. Three reels was the
// wrong machine to apply it to.
//
// FIVE REELS AND TWENTY LINES IS THE FIX, and it is why every real cabinet on a real floor is shaped this way.
// Betting twenty lines, a 2x win on ONE line is a tenth of what you staked. You get a hit — a line drawn
// across the screen, a sound, a number climbing — several times a minute, and nobody has to pretend you
// profited. Small wins become honest instead of insulting, so they are allowed to exist again, and the hit
// rate goes back up to where a machine feels alive.
//
// ── AND WHAT A WIN IS MADE OF ────────────────────────────────────────────────────────────────────────────────
// The other half of what real machines do: THE MONEY LIVES IN THE FEATURES. On a modern cabinet 30-50% of the
// whole return sits inside the free-spins round, which is why triggering one feels enormous — because it
// genuinely is where the money is. Ours put everything in the base game, so there was never anything to chase.
// Here the base game pays about half, and the rest is in the Hunt Moon free spins and the Chest pick.
//
// ── WHY THERE IS NO RTP CEILING IN THIS FILE ─────────────────────────────────────────────────────────────────
// Because there is no gold coming back. You stake GOLD and the machine pays CHIPS, so every gold piece staked
// is destroyed and the casino is a pure sink; a chip is a ticket, not money. That makes "returns 88%"
// meaningless here, and it frees the paytable completely — a 4,000x line hit prints no gold whatsoever.
//
// What replaces the ceiling is stricter, not looser: every machine returns exactly 1.00x in CHIPS on average
// (see check:slot5), so no cabinet is ever the smart pick and the only thing separating them is volatility.
// The whole economy is then two numbers that live somewhere else — chips minted per gold staked, and what the
// chip store charges — instead of five paytables each fighting a ceiling.

// ── THE TWENTY LINES ─────────────────────────────────────────────────────────────────────────────────────────
// Row index per reel, 0 top, 1 middle, 2 bottom. The order matters: the first three are the straight lines
// everybody reads first, then the V and the caret, then the shapes. A player never counts these — they see a
// line light up and believe it — but they must be DISTINCT, or two "different" lines award the same win twice
// and the machine quietly pays double.
export const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
    [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
    [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
    [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [0, 2, 0, 2, 0],
];

export const ROWS = 3;
export const REELS = 5;

// ── THE CABINETS ─────────────────────────────────────────────────────────────────────────────────────────────
// `strips` is one weighted symbol bag PER REEL, which is the single most important difference from the old
// machines and the reason a five-reel game can be tuned at all. A wild that appears on every reel makes five
// wilds catastrophically likely; confine it to reels 2-4 and the top line becomes reachable-but-rare without
// touching a single payout number. Every real machine is tuned this way.
//
// `pays` is per LINE bet, in chips, keyed by how many matched from the left. A line bet is the total bet
// divided by 20, so a 400x line hit is 20x what you actually staked — the report in check:slot5 prints both,
// because those two numbers feel completely different and only one of them is what a player experiences.
const HUNT = {
    id: "slot",
    label: "The Hunt",
    blurb: "Twenty lines through the trees. The moon opens the hunt.",
    wild: "wolf",          // substitutes for everything except the scatter
    scatter: "moon",       // pays from anywhere, and three of them open the free spins
    bonus: "chest",        // three or more, anywhere, opens the pick
    // Reel 1 has no wild, which is what stops the machine paying five-of-a-kind too often, and reel 5 has
    // fewer scatters, which is what makes the third moon land late and slow — the anticipation is built into
    // the strip rather than faked by the animation.
    // THE MOON ONLY RISES ON ONE, THREE AND FIVE. Free spins used to open every 22 spins, which is not a
    // feature, it is the base game wearing a hat — a real round comes once every hundred-odd spins and that
    // rarity is exactly what makes it worth wanting. Confining the scatter to the odd reels is how every
    // cabinet on a real floor does it, and it costs nothing: you still SEE moons constantly, on the reels
    // that matter, so the near-miss is as loud as ever while the trigger itself gets properly rare.
    strips: [
        { bone: 30, doubloon: 22, laurel: 16, chest: 6, moon: 5, wolf: 0 },
        { bone: 28, doubloon: 21, laurel: 15, chest: 6, moon: 0, wolf: 5 },
        { bone: 28, doubloon: 20, laurel: 14, chest: 6, moon: 4, wolf: 6 },
        { bone: 28, doubloon: 21, laurel: 15, chest: 6, moon: 0, wolf: 5 },
        { bone: 30, doubloon: 23, laurel: 16, chest: 6, moon: 4, wolf: 0 },
    ],
    // BONE DOES NOT PAY AT THREE, and that single omission is what makes the machine tunable. With only
    // four paying symbols across five reels, three-of-a-kind on twenty lines is close to a certainty — the
    // first cut of this table paid on 78% of spins and returned five times what it should. Real cabinets
    // solve it with nine or ten symbols; with four, the commonest one has to be a symbol you are pleased to
    // see FOUR of and indifferent to three of, which is exactly the job blanks do on a physical reel strip.
    pays: {
        wolf: { 3: 16, 4: 145, 5: 2000 },
        chest: { 3: 5.5, 4: 48, 5: 480 },
        laurel: { 3: 2, 4: 14.5, 5: 120 },
        doubloon: { 3: 1, 4: 5.5, 5: 40 },
        bone: { 4: 2, 5: 16 },
    },
    // Scatters pay a multiple of the TOTAL bet, not the line bet, because they do not sit on a line. This is
    // the one payout a player can always find without understanding paylines.
    scatterPays: { 3: 1.2, 4: 5.5, 5: 36 },
};

export const SLOTS5 = { slot: HUNT };
export const slot5 = (id) => SLOTS5[id] || SLOTS5.slot;

// ── SPINNING ─────────────────────────────────────────────────────────────────────────────────────────────────
const pick = (bag, rng) => {
    const keys = Object.keys(bag).filter((k) => bag[k] > 0);
    const total = keys.reduce((a, k) => a + bag[k], 0);
    let r = rng() * total;
    for (const k of keys) { r -= bag[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
};

/** A grid: five reels of three symbols, top to bottom. */
export function spinGrid(m, rng = Math.random) {
    return m.strips.map((bag) => Array.from({ length: ROWS }, () => pick(bag, rng)));
}

// ── WHAT A GRID PAID ─────────────────────────────────────────────────────────────────────────────────────────
// Left to right from reel one, which is the rule every real machine uses and the reason a win always starts at
// the left edge: it halves the number of winning combinations, which is what makes the top prizes affordable.
//
// `mult` is the feature multiplier — 1 in the base game, more inside free spins. It multiplies LINE and
// SCATTER wins, and deliberately not the pick bonus, which brings its own numbers.
export function evaluate(m, grid, { lineBet = 1, mult = 1 } = {}) {
    const wins = [];
    let total = 0;

    for (let i = 0; i < LINES.length; i += 1) {
        const line = LINES[i];
        const seq = line.map((row, reel) => grid[reel][row]);
        // The symbol the run is made of is the first non-wild — a line that opens with wilds pays as whatever
        // it turns into. A line of nothing but wilds pays as wilds, which is the top award on the machine.
        const lead = seq.find((s) => s !== m.wild && s !== m.scatter) || m.wild;
        if (lead === m.scatter) continue;
        let n = 0;
        while (n < seq.length && (seq[n] === lead || seq[n] === m.wild)) n += 1;
        const pay = m.pays[lead]?.[n];
        if (!pay) continue;
        const amount = pay * lineBet * mult;
        total += amount;
        wins.push({ kind: "line", line: i, symbol: lead, count: n, amount });
    }

    // Scatters pay from anywhere, on the total bet.
    const scatters = grid.flat().filter((s) => s === m.scatter).length;
    const sPay = m.scatterPays[scatters];
    if (sPay) {
        const amount = sPay * lineBet * LINES.length * mult;
        total += amount;
        wins.push({ kind: "scatter", symbol: m.scatter, count: scatters, amount });
    }

    const bonuses = grid.flat().filter((s) => s === m.bonus).length;
    return {
        wins,
        total,
        scatters,
        bonuses,
        freeSpins: scatters >= 3,
        // FIVE chests, not four. At four the pick opened every fifteenth spin and carried 38% of the whole
        // machine — a bonus round you cannot go two minutes without seeing is a chore with a board on it.
        pick: bonuses >= 5,
    };
}

// ── THE FEATURES ─────────────────────────────────────────────────────────────────────────────────────────────
// AGENCY THAT IS NOT A LIE. Three ways to take the free spins, tuned so no option is the correct one — the
// expected return of all three is within a couple of percent, and which is best genuinely depends on nothing.
// This is what real cabinets do and it is not a trick: the choice changes the SHAPE of the outcome, which is
// the part anybody actually cares about. Take the twenty at 1x and you will probably win something; take the
// eight at 5x and you will probably win nothing, or you will remember it for a month.
export const FREE_SPIN_OFFERS = [
    { id: "many", label: "Twenty spins", sub: "everything pays double", spins: 20, mult: 2, sticky: false },
    { id: "mid", label: "Ten spins", sub: "everything pays four times", spins: 10, mult: 4, sticky: false },
    // Seven, not eight. Sticky wilds are worth about 2.5x a plain spin because the grid fills up as the round
    // runs down — measured, not guessed — so the count has to come down to keep the three offers level.
    { id: "few", label: "Seven spins", sub: "wilds stay where they land, everything doubled", spins: 7, mult: 2, sticky: true },
];

/**
 * Run a free-spins round. Sticky wilds are the reason the third offer is worth taking: a wolf that lands on
 * reel 3 stays there for the rest of the round, so the last spins of a short round are played on a grid that
 * has been filling up with wilds — the round gets better as it runs out, which is the opposite of how a
 * losing streak feels and is exactly why players chase it.
 */
export function runFreeSpins(m, offer, { lineBet = 1, rng = Math.random } = {}) {
    const stuck = [];   // [reel, row] positions holding a wild for the rest of the round
    let total = 0;
    const spins = [];
    for (let i = 0; i < offer.spins; i += 1) {
        const grid = spinGrid(m, rng);
        for (const [reel, row] of stuck) grid[reel][row] = m.wild;
        const r = evaluate(m, grid, { lineBet, mult: offer.mult });
        if (offer.sticky) {
            for (let reel = 0; reel < REELS; reel += 1) {
                for (let row = 0; row < ROWS; row += 1) {
                    if (grid[reel][row] === m.wild && !stuck.some((p) => p[0] === reel && p[1] === row)) stuck.push([reel, row]);
                }
            }
        }
        total += r.total;
        spins.push({ grid, ...r });
    }
    return { total, spins, stuck };
}

// ── THE PICK ─────────────────────────────────────────────────────────────────────────────────────────────────
// Four chests open a board of twelve. You keep picking until you turn over the one that ends it, and every
// pick is either chips or a multiplier on everything you have collected so far. The multiplier is what makes
// this worth playing rather than watching: a board that has already paid four times is a board you do NOT want
// to stop, and that tension is the entire feature.
export const PICK_BOARD = [
    ...Array.from({ length: 5 }, () => ({ kind: "chips", value: 10 })),
    ...Array.from({ length: 3 }, () => ({ kind: "chips", value: 24 })),
    { kind: "chips", value: 72 },
    { kind: "mult", value: 2 },
    { kind: "mult", value: 3 },
    { kind: "end" },
];

export function runPick(m, { lineBet = 1, rng = Math.random } = {}) {
    const board = PICK_BOARD.map((c) => ({ ...c }));
    // Fisher-Yates, so every arrangement is equally likely. A sort() with a random comparator is NOT a
    // shuffle and biases the ends of the array, which on a paying board is a real edge to whoever spots it.
    for (let i = board.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [board[i], board[j]] = [board[j], board[i]];
    }
    let sum = 0; let mult = 1;
    const picked = [];
    for (const card of board) {
        picked.push(card);
        if (card.kind === "end") break;
        if (card.kind === "mult") mult *= card.value;
        else sum += card.value;
    }
    return { total: sum * mult * lineBet, picked, mult };
}

// ── ONE WHOLE PLAY, START TO FINISH ──────────────────────────────────────────────────────────────────────────
// Everything a single press of the button can turn into, resolved in one place so the simulator and the live
// machine cannot disagree about what a spin is worth. `offerId` is the member's choice when the free spins
// trigger; the simulator passes a fixed one, the real machine passes what they tapped.
export function playSpin(m, { bet = 100, rng = Math.random, offerId = "mid" } = {}) {
    const lineBet = bet / LINES.length;
    const grid = spinGrid(m, rng);
    const base = evaluate(m, grid, { lineBet });
    let total = base.total;
    let free = null; let pick = null;
    if (base.freeSpins) {
        const offer = FREE_SPIN_OFFERS.find((o) => o.id === offerId) || FREE_SPIN_OFFERS[1];
        free = runFreeSpins(m, offer, { lineBet, rng });
        total += free.total;
    }
    if (base.pick) {
        pick = runPick(m, { lineBet, rng });
        total += pick.total;
    }
    return { grid, base, free, pick, total, bet };
}
