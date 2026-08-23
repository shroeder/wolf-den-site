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

// ── COLOUR IS THE PAYTABLE ───────────────────────────────────────────────────────────────────────────────────
// Luke, looking at the finished screen: "the sprites seem monotone, and nondescript. for example, i think one
// of these is a wild, but because its all monotone, its really hard to tell. the same is true for icons that
// pay more, and ones that trigger the bonus."
//
// He found the bug in the art brief. Every symbol on a cabinet was drawn to one shared MOOD line — The Hunt's
// was "warm polished BRASS and deep gold" — so all six came back the same colour. That line existed to make a
// reel read as a SET, which it did, at the cost of the only job colour has on a slot machine: telling you what
// you are looking at before you have read anything. Six gold objects on a black field is a machine you have to
// study. A set can be held together by drawing style and framing instead, and those cost nothing.
//
// So colour is assigned by ROLE and by RANK, in one place, and both halves of the game read it: the art
// generator builds its prompts from `look`, and the screen tints each cell from `tone`. One map, so a symbol
// cannot be violet in the picture and gold in the glow.
//
// The ladder runs COOL AND PLAIN at the bottom to WARM AND RICH at the top, which is the order a person reads
// without being taught it — and the two symbols that are not part of the ladder at all sit outside it on
// purpose. The scatter is the only cold bright thing on the reel and the wild is the only violet one; neither
// can be mistaken for a paying symbol, which is exactly what they are not.
export const SYMBOL_LOOK = {
    bone: { rank: 1, role: "low", tone: "#8fa3b8",
        look: "COOL SLATE GREY-BLUE, plain and unglamorous — the cheapest thing on the reel" },
    doubloon: { rank: 2, role: "low", tone: "#d99a3c",
        look: "WARM COPPER and old bronze, dull rather than bright" },
    laurel: { rank: 3, role: "mid", tone: "#4fc98a",
        look: "RICH EMERALD GREEN with pale gold edging, the first symbol on the reel that looks valuable" },
    chest: { rank: 4, role: "bonus", tone: "#ff8c2b",
        look: "BLAZING AMBER-ORANGE, hot light spilling out of it, the brightest warm thing on the reel" },
    moon: { rank: 5, role: "scatter", tone: "#7ad4ff",
        look: "ICE-BLUE and silver-white, glowing cold — the ONLY cold bright colour on the whole reel, so it "
            + "cannot be mistaken for anything that pays on a line" },
    wolf: { rank: 6, role: "wild", tone: "#b47cff",
        look: "DEEP VIOLET and amethyst with a bright GOLD rim light — the only violet on the reel, and the "
            + "richest thing on it. It substitutes for every other symbol, so it must look like none of them" },
};

export const symbolTone = (id) => SYMBOL_LOOK[id]?.tone || "#cbd3dc";
export const symbolRole = (id) => SYMBOL_LOOK[id]?.role || "low";

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
    // Its free round is the only one on the floor you CHOOSE the shape of — see FREE_SPIN_OFFERS.
    free: { kind: "deals", spins: 10, label: "Ten spins, four times" },
    second: { kind: "pick", board: "pen", label: "The Petting Pen",
        chips: [10, 10, 10, 10, 10, 24, 24, 24, 72], mults: [2, 3] },
};

// ── AND THE OTHER FOUR ───────────────────────────────────────────────────────────────────────────────────────
// The floor was one rebuilt cabinet and four three-reel machines with one payline between them, which is the
// arrangement that produced "you have engineered the most boring slots ever" in the first place. Worse, of the
// five only two had even TWO features of their own, and the ones they had were shared: The Menagerie's nudge
// was The Hunt's nudge, The Vault's pack was The Hunt's pack, and the Pot was on all five, so it separated
// nothing.
//
// WHAT MAKES A CABINET ITS OWN CABINET is not a paint job and it is not a different jackpot number. It is
// VOLATILITY — how often it pays against how much it pays when it does — and the SHAPE of its features. So
// each of these is tuned to a different place on that curve, and each carries a free-spin variant and a second
// feature that no other machine on the floor has in the same pair:
//
//   The Hunt        middling         three deals to choose from        the petting pen
//   The Harvest     gentle           the multiplier grows every spin   hold and spin — the wagon
//   The Deep        savage           expanding wilds                   a pick — the trawl
//   The Menagerie   busy             scatters retrigger for more       hold and spin — the stampede
//   The Vault       brutal           a multiplier ladder x2 to x10     a pick — the locks
//
// The two hold-and-spins differ in what locks and what it pays; the two picks differ in what ends them. Every
// one of them is checked by check:slot5, which enforces the only rule that matters: every machine returns
// 1.00x in chips, so none of them is the smart pick and volatility is genuinely all that separates them.

const HARVEST = {
    id: "slot2",
    label: "The Harvest",
    blurb: "The kindest reels on the floor. The wagon fills slowly and empties all at once.",
    wild: "wolf",
    scatter: "moon",
    // GENTLE. The widest spread of low symbols and the shortest ceiling — this is the cabinet somebody plays
    // for an hour without ever feeling mugged, and it is the only one whose wild appears on four reels.
    strips: [
        { bone: 26, doubloon: 22, laurel: 18, chest: 8, moon: 6, wolf: 0 },
        { bone: 24, doubloon: 21, laurel: 17, chest: 8, moon: 0, wolf: 7 },
        { bone: 24, doubloon: 20, laurel: 16, chest: 8, moon: 5, wolf: 8 },
        { bone: 24, doubloon: 21, laurel: 17, chest: 8, moon: 0, wolf: 7 },
        { bone: 26, doubloon: 22, laurel: 18, chest: 8, moon: 5, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 5, 4: 31, 5: 262 },
        chest: { 3: 2.6, 4: 13.5, 5: 94 },
        laurel: { 3: 1.3, 4: 6.5, 5: 37 },
        doubloon: { 3: 0.6, 4: 3.1, 5: 15.5 },
        bone: { 3: 0.4, 4: 1.6, 5: 7.5 },
    },
    scatterPays: { 3: 0.8, 4: 3.1, 5: 15.5 },
    free: { kind: "growing", spins: 14, label: "Fourteen spins, and the multiplier climbs" },
    second: { kind: "hold", trigger: "doubloon", need: 9, spins: 3, label: "The Wagon",
        values: [1, 1, 1, 1.6, 1.6, 2.6, 4, 8], full: 105 },
};

const DEEP = {
    id: "slot3",
    label: "The Deep",
    blurb: "Little comes up. What does is enormous.",
    wild: "wolf",
    scatter: "star",
    // SAVAGE. Almost no cheap wins — bone does not pay at all, doubloon needs four — and the top of the table
    // is the largest number on the floor. This is the cabinet that goes quiet for twenty spins.
    strips: [
        { bone: 34, doubloon: 24, laurel: 14, chest: 6, star: 7, wolf: 0 },
        { bone: 32, doubloon: 23, laurel: 13, chest: 6, star: 0, wolf: 5 },
        { bone: 32, doubloon: 22, laurel: 12, chest: 6, star: 6, wolf: 6 },
        { bone: 32, doubloon: 23, laurel: 13, chest: 6, star: 0, wolf: 5 },
        { bone: 34, doubloon: 24, laurel: 14, chest: 6, star: 6, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 22, 4: 167, 5: 2224 },
        chest: { 3: 6.5, 4: 50, 5: 500 },
        laurel: { 3: 2.2, 4: 14.5, 5: 122 },
        doubloon: { 4: 5, 5: 39 },
        bone: { 5: 11 },
    },
    scatterPays: { 3: 1.1, 4: 5, 5: 33 },
    free: { kind: "expanding", spins: 14, label: "Fourteen spins, and every wild takes its whole reel" },
    second: { kind: "pick", board: "trawl", label: "The Trawl",
        chips: [8, 8, 8, 16.5, 16.5, 16.5, 50], mults: [2, 3, 5] },
};

const MENAGERIE = {
    id: "slot4",
    label: "The Menagerie",
    blurb: "Something is always moving. Three moons and it starts again.",
    wild: "wolf",
    scatter: "moon",
    // BUSY. The highest hit rate on the floor and the flattest table — small things happen constantly, which
    // is the whole character, and its free round can restart itself forever.
    strips: [
        { bone: 22, doubloon: 20, laurel: 18, chest: 10, moon: 6, wolf: 0 },
        { bone: 21, doubloon: 19, laurel: 17, chest: 10, moon: 0, wolf: 8 },
        { bone: 21, doubloon: 18, laurel: 16, chest: 10, moon: 5, wolf: 9 },
        { bone: 21, doubloon: 19, laurel: 17, chest: 10, moon: 0, wolf: 8 },
        { bone: 22, doubloon: 20, laurel: 18, chest: 10, moon: 5, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 10.5, 4: 60, 5: 514 },
        chest: { 3: 5, 4: 26, 5: 171 },
        laurel: { 3: 2.6, 4: 12, 5: 68 },
        doubloon: { 3: 1.3, 4: 6, 5: 29 },
        bone: { 3: 0.9, 4: 3.4, 5: 13.5 },
    },
    scatterPays: { 3: 1.3, 4: 6, 5: 31 },
    free: { kind: "retrigger", spins: 14, label: "Fourteen spins, and three more moons buys fourteen more" },
    second: { kind: "hold", trigger: "chest", need: 6, spins: 3, label: "The Stampede",
        values: [1.7, 1.7, 2.6, 2.6, 3.4, 5, 8.5, 15.5], full: 223 },
};

const VAULT = {
    id: "slot5",
    label: "The Vault",
    blurb: "It rarely opens. When it does, it opens all the way.",
    wild: "wolf",
    scatter: "moon",
    // BRUTAL. The rarest wild on the floor and the fewest paying combinations, against the highest ladder in
    // the free round. Everything about this cabinet is a long wait for one number.
    strips: [
        { bone: 36, doubloon: 24, laurel: 12, chest: 5, moon: 4, wolf: 0 },
        { bone: 34, doubloon: 23, laurel: 12, chest: 5, moon: 0, wolf: 4 },
        { bone: 34, doubloon: 22, laurel: 11, chest: 5, moon: 3, wolf: 5 },
        { bone: 34, doubloon: 23, laurel: 12, chest: 5, moon: 0, wolf: 4 },
        { bone: 36, doubloon: 24, laurel: 12, chest: 5, moon: 3, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 29, 4: 221, 5: 2905 },
        chest: { 3: 8, 4: 64, 5: 639 },
        laurel: { 3: 2.9, 4: 18.5, 5: 151 },
        doubloon: { 4: 6.5, 5: 46 },
        bone: { 5: 13 },
    },
    scatterPays: { 3: 1.2, 4: 6, 5: 41 },
    free: { kind: "ladder", spins: 20, label: "Twenty spins, and the ladder runs x2 to x10" },
    second: { kind: "pick", board: "locks", label: "The Locks",
        chips: [11.5, 11.5, 11.5, 26, 26, 81], mults: [3, 5] },
};

export const SLOTS5 = { slot: HUNT, slot2: HARVEST, slot3: DEEP, slot4: MENAGERIE, slot5: VAULT };
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

    // WHAT OPENS THIS CABINET'S SECOND FEATURE. A pick counts its bonus symbol; a hold-and-spin counts its
    // coin. Read off the machine rather than hard-coded, or four of the five cabinets quietly trigger on The
    // Hunt's chest — which is not even on two of their reels.
    const secondSym = m.second?.kind === "hold" ? m.second.trigger : (m.bonus || "chest");
    const need = m.second?.kind === "hold" ? (m.second.need || 6) : 5;
    const bonuses = grid.flat().filter((x) => x === secondSym).length;
    return {
        wins,
        total,
        scatters,
        bonuses,
        freeSpins: scatters >= 3,
        // FIVE chests, not four. At four the pick opened every fifteenth spin and carried 38% of the whole
        // machine — a bonus round you cannot go two minutes without seeing is a chore with a board on it.
        pick: bonuses >= need,
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
/**
 * Run a free-spins round.
 *
 * FIVE SHAPES, ONE LOOP. Every cabinet's round is the same ten-line function with a different modifier, which
 * is the only way five of them stay in step: a second copy of this drifts, and the one that drifts is the one
 * nobody is looking at. What differs per machine is `kind`:
 *
 *   deals      the member picked the count and multiplier up front (The Hunt only — see FREE_SPIN_OFFERS)
 *   growing    the multiplier starts at 1 and gains 1 every spin, so the last spin is worth ten of the first
 *   expanding  any wild that lands fills its whole reel, which is how a savage machine pays anything at all
 *   retrigger  three more scatters inside the round buys the round again, and it can happen repeatedly
 *   ladder     a fixed climb, x2 x2 x3 x3 x5 x5 x7 x7 x10 x10 — known in advance and still worth watching
 *
 * STICKY WILDS are a rider rather than a kind, because The Hunt's third deal uses them and nothing else does.
 */
const LADDER = [2, 2, 3, 3, 5, 5, 7, 7, 10, 10];

export function runFreeSpins(m, offer, { lineBet = 1, rng = Math.random } = {}) {
    const stuck = [];   // [reel, row] positions holding a wild for the rest of the round
    let total = 0;
    const spins = [];
    let left = offer.spins;
    let i = 0;
    let added = 0;      // spins bought by retriggering
    // A hard stop. `retrigger` can in principle buy spins forever, and a round that never ends is a request
    // that never returns — this is the same class of bug as a fight that cannot finish.
    const CEILING = 120;

    while (i < left && i < CEILING) {
        const grid = spinGrid(m, rng);
        for (const [reel, row] of stuck) grid[reel][row] = m.wild;

        // EXPANDING: a wild takes its whole reel. Applied before scoring, so it pays as five wilds would.
        if (offer.kind === "expanding") {
            for (let reel = 0; reel < REELS; reel += 1) {
                if (grid[reel].includes(m.wild)) grid[reel] = Array.from({ length: ROWS }, () => m.wild);
            }
        }

        const mult = offer.kind === "growing" ? (i + 1)
            : offer.kind === "ladder" ? (LADDER[i % LADDER.length])
            : (offer.mult || 1);

        const r = evaluate(m, grid, { lineBet, mult });

        // RETRIGGER: three scatters inside the round buys the whole round again.
        if (offer.kind === "retrigger" && r.scatters >= 3 && left + offer.spins <= CEILING) {
            left += offer.spins;
            added += offer.spins;
        }

        if (offer.sticky) {
            for (let reel = 0; reel < REELS; reel += 1) {
                for (let row = 0; row < ROWS; row += 1) {
                    if (grid[reel][row] === m.wild && !stuck.some((p) => p[0] === reel && p[1] === row)) stuck.push([reel, row]);
                }
            }
        }
        total += r.total;
        spins.push({ grid, ...r, mult });
        i += 1;
    }
    return { total, spins, stuck, added };
}

// ── HOLD AND SPIN ────────────────────────────────────────────────────────────────────────────────────────────
// The other kind of bonus round, and the reason The Harvest and The Menagerie do not simply have The Hunt's.
// Six or more coins land, every coin LOCKS in place, and you get three respins — every new coin resets the
// count back to three. The tension is the opposite of a pick: a pick is "how long can I keep going", this is
// "please, one more", and it ends by running out of luck rather than by turning over the wrong thing.
//
// Each locked coin carries its own value, so a full board is a real number rather than a fixed prize.
export function runHold(m, cfg, { lineBet = 1, rng = Math.random } = {}) {
    const CELLS = REELS * ROWS;
    // PER CABINET. The Wagon and the Stampede pay differently, and — just as importantly — every payout
    // a machine has must live ON the machine, or a per-cabinet rescale silently misses the ones it does not.
    const VALUES = cfg.values || [2, 2, 2, 3, 3, 5, 8, 15];
    const held = new Array(CELLS).fill(0);      // 0 = empty, else the coin's value
    const steps = [];
    // The coins that triggered it are already on the board.
    let seeded = 0;
    while (seeded < cfg.need) {
        const at = Math.floor(rng() * CELLS);
        if (!held[at]) { held[at] = VALUES[Math.floor(rng() * VALUES.length)]; seeded += 1; }
    }
    steps.push({ held: held.slice(), got: seeded, left: cfg.spins });

    let left = cfg.spins;
    // The chance a given empty cell catches a coin. Tuned so a board very rarely fills and usually stops
    // three or four coins in — check:slot5 measures what this is actually worth.
    const CATCH = 0.055;
    while (left > 0 && held.some((v) => !v)) {
        let got = 0;
        for (let c = 0; c < CELLS; c += 1) {
            if (!held[c] && rng() < CATCH) { held[c] = VALUES[Math.floor(rng() * VALUES.length)]; got += 1; }
        }
        left = got > 0 ? cfg.spins : left - 1;
        steps.push({ held: held.slice(), got, left });
    }
    const filled = held.filter(Boolean).length;
    // A FULL BOARD IS THE THING PEOPLE TELL EACH OTHER ABOUT. It is rare enough to be worth a real number.
    const bonus = filled === CELLS ? (cfg.full || 200) : 0;
    const total = (held.reduce((a, v) => a + v, 0) + bonus) * lineBet;
    return { total, steps, filled, full: filled === CELLS };
}

// ── THE PICK ─// ── THE PICK ─────────────────────────────────────────────────────────────────────────────────────────────────
// Four chests open a board of twelve. You keep picking until you turn over the one that ends it, and every
// pick is either chips or a multiplier on everything you have collected so far. The multiplier is what makes
// this worth playing rather than watching: a board that has already paid four times is a board you do NOT want
// to stop, and that tension is the entire feature.
// The Hunt's board, kept as the default for anything that does not bring its own. Each cabinet's real board
// is on the cabinet — see `second.chips` and `second.mults` — for the same reason the hold's coins are: a
// payout that lives in a shared constant is a payout a per-cabinet rescale cannot reach.
export const PICK_BOARD = [
    ...Array.from({ length: 5 }, () => ({ kind: "chips", value: 10 })),
    ...Array.from({ length: 3 }, () => ({ kind: "chips", value: 24 })),
    { kind: "chips", value: 72 },
    { kind: "mult", value: 2 },
    { kind: "mult", value: 3 },
    { kind: "end" },
];

/** A cabinet's own board, built from its numbers. One "end" card, always — that is what makes it a pick. */
export function boardFor(m) {
    const cfg = m?.second;
    if (!cfg || cfg.kind !== "pick" || !cfg.chips) return PICK_BOARD.map((c) => ({ ...c }));
    return [
        ...cfg.chips.map((v) => ({ kind: "chips", value: v })),
        ...(cfg.mults || []).map((v) => ({ kind: "mult", value: v })),
        { kind: "end" },
    ];
}

export function runPick(m, { lineBet = 1, rng = Math.random } = {}) {
    const board = boardFor(m);
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
    let free = null; let pick = null; let hold = null;

    if (base.freeSpins) {
        // THE HUNT IS THE ONLY CABINET YOU CHOOSE. Everywhere else the round has one shape, and that shape is
        // the machine's identity rather than a setting — see the note on SLOTS5.
        const offer = m.free?.kind === "deals"
            ? (FREE_SPIN_OFFERS.find((o) => o.id === offerId) || FREE_SPIN_OFFERS[1])
            : { id: m.free.kind, kind: m.free.kind, label: m.free.label, spins: m.free.spins, mult: 1, sticky: false };
        free = runFreeSpins(m, offer, { lineBet, rng });
        free.kind = offer.kind || "deals";
        free.label = offer.label;
        total += free.total;
    }
    if (base.pick) {
        if (m.second?.kind === "hold") {
            hold = runHold(m, m.second, { lineBet, rng });
            total += hold.total;
        } else {
            pick = runPick(m, { lineBet, rng });
            total += pick.total;
        }
    }
    return { grid, base, free, pick, hold, total, bet };
}
