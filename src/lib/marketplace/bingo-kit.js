// ── BINGO, AND WHY IT IS NOT KENO WITH A GRID ────────────────────────────────────────────────────────────────
// This floor already has a game where you pick numbers and the house draws some. Adding a second one with a
// nicer layout would be exactly the thing the three slot cabinets were built to avoid: one machine painted
// twice.
//
// The original answer was EVERYBODY IN THE ROOM PLAYS THE SAME DRAW — a shared three-minute round, the ritual
// of a real hall, the one thing a solo game cannot reproduce.
//
// ── AND IT IS GONE, BECAUSE NOBODY WAS EVER IN THE ROOM ──────────────────────────────────────────────────────
// Luke: "you can remove all multiplayer for many of the games that we had previously tried to do."
//
// He is right and the evidence was on his own screen: the hall said "nobody yet" and the keno board said
// "Drawn in 1s" with an empty player list. A shared round is a wonderful idea for a floor with forty people on
// it and a cruel one for a floor with two, because what it actually delivers is A WAIT. Three minutes of
// nothing, ending in a draw you were told about rather than shown, in exchange for company that is not there.
// The odds were always identical either way — a random card against a known set of forty balls is a random
// card — so the shared round was buying atmosphere with the player's time, and it was buying none.
//
// So the draw belongs to the CARD now. You buy, the balls come out, you see how you did. No round, no clock,
// no waiting for strangers. What replaces the ritual is a thing that can only happen to you — see the dragon.
//
// THE DRAW IS STILL SEEDED, per card rather than per round, which keeps `drawFor` reproducible for the check
// script and for anything that ever needs to replay a card from its row.

export const BALLS = 75;
// FORTY BALLS, and the number is load-bearing. At thirty, a card paid something on 15.7% of deals — and this
// is the one game on the floor with a WAIT in it. A wait that ends in nothing five times in six is the worst
// thing a game can ask of anybody, however good its average is. Forty pays on 46% of cards.
export const DRAWN = 40;
/** Five columns of fifteen, the way a bingo card has always been laid out: B is 1-15, I is 16-30, and so on. */
export const COLUMNS = ["B", "I", "N", "G", "O"];
export const PER_COLUMN = 15;
/** Which letter a called number belongs under. The card knows from its column; the ball strip does not. */
export const letterFor = (n) => COLUMNS[Math.min(4, Math.floor((Math.max(1, n) - 1) / PER_COLUMN))];

// ── WHAT THE CALLER SAYS ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "bingo needs a lot more generated sprites and flavor."
//
// A real bingo hall has never just read the number out, and the nicknames are the single most recognisable
// thing about the game — most people who have never played one can still tell you what two little ducks is.
// It is free flavour in the truest sense: it costs one line of text per ball on a line the screen was already
// drawing, and it turns forty numbers being announced into somebody announcing them.
//
// TRADITIONAL WHERE THERE IS A TRADITION, and kept clean where the traditional call is a bit blue — this is a
// card shop's game and the room is all ages. Where the old call was suggestive it has been swapped for another
// real one rather than for something invented, so the set still sounds like a bingo hall.
//
// The number is printed after whatever is in here, the way a caller does it — "legs eleven, eleven" — so these
// are nicknames only and none of them needs to end in its own digits.
export const CALLS = [null,
    "On its own", "One little duck", "Cup of tea", "Knock at the door", "Man alive",
    "Half a dozen", "Lucky seven", "Garden gate", "Doctor's orders", "The Den's own",
    "Legs eleven", "One dozen", "Unlucky for some", "The valentine", "Young and keen",
    "Sweet sixteen", "Dancing queen", "Coming of age", "Goodbye teens", "One score",
    "Key of the door", "Two little ducks", "Thee and me", "Two dozen", "Duck and dive",
    "Pick and mix", "Gateway to heaven", "In a state", "Rise and shine", "Burlington Bertie",
    "Get up and run", "Buckle my shoe", "All the threes", "Ask for more", "Jump and jive",
    "Three dozen", "A flea in heaven", "Christmas cake", "Those famous steps", "Life begins",
    "Time for fun", "Winnie the Pooh", "Down on your knees", "All the fours", "Halfway there",
    "Up to tricks", "Four and seven", "Four dozen", "On the beat", "Half a century",
    "Tweak of the thumb", "Deck of cards", "Stuck in the tree", "Clean the floor", "All the fives",
    "Shotgun", "Heinz varieties", "Make them wait", "The Brighton line", "Five dozen",
    "Baker's bun", "Tickety-boo", "Tickle me", "Almost retired", "Retirement age",
    "Clickety click", "Stairway to heaven", "Saving grace", "Same both ways", "Three score and ten",
    "Bang on the drum", "Six dozen", "Queen bee", "Hit the floor", "Strive and strive",
];
/** The caller's name for a ball. Falls back to nothing rather than to a wrong one. */
export const callFor = (n) => CALLS[Number(n)] || null;

/** A deterministic generator from one integer. Same seed, same numbers, on every server that asks. */
export function seeded(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

/** The forty balls for one card, from its own seed. Drawn in order, because the order is the show. */
export function drawFor(seed, salt = 0) {
    const rng = seeded((seed * 2654435761 + salt) >>> 0);
    const pool = Array.from({ length: BALLS }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, DRAWN);
}

/**
 * A card: five columns of five, each column drawn from its own fifteen, with the centre square free.
 * Returned column-major (`card[col][row]`) because that is the constraint that generates it — the render
 * transposes it, which is cheaper than storing it in the shape that makes the rules harder to check.
 */
export function makeCard(rng = Math.random) {
    return COLUMNS.map((_, col) => {
        const lo = col * PER_COLUMN + 1;
        const pool = Array.from({ length: PER_COLUMN }, (_, i) => lo + i);
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const column = pool.slice(0, 5);
        if (col === 2) column[2] = 0;   // the free square, and the only 0 that can ever appear
        return column;
    });
}

// ── THE DRAGON ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "for bingo we need to create a bonus that has a dragon that flies around and lights tiles on fire to
// give you free tiles, that happens randomly."
//
// This is the thing that replaces the shared round, and it replaces it exactly: what the hall was FOR was a
// moment where the whole table reacts at once, and this is a moment that belongs to one card. A dragon comes
// over the board, sets squares alight, and every burning square is yours whether the ball comes out or not.
//
// TWO RULES MAKE IT WORTH WATCHING RATHER THAN JUST WORTH HAVING:
//
//   1. IT ONLY BURNS SQUARES YOU DID NOT ALREADY HAVE. A dragon that lands on a number already drawn has
//      given you nothing, and it would do that 53% of the time — over half of the best event in the game
//      spent on squares that were already marked. Every square it lights is a square that changes the card.
//
//   2. IT BURNS AFTER THE DRAW, NOT BEFORE. Same reason. The draw decides what you have; the dragon decides
//      what you get anyway. That ordering is also what makes it showable: the balls come out, the card
//      settles, you can see exactly what you are one square away from — and then the dragon arrives.
//
// WHAT IT IS WORTH. Free squares are enormously powerful here, because a line needs five and the card is
// mostly near-misses: the difference between four-of-five and a line is the entire game. The dragon is
// therefore priced as a real feature rather than a garnish — it is what carries this cabinet from the gold
// paytable's 88% up to the 1.00x in chips that every slot on this floor returns. See check:bingo, which
// deals two million cards through this exact function and prints what the dragon is worth on its own.
export const DRAGON_CHANCE = 0.12;

// ── HOW IT FLIES, AND WHY THAT IS THE WHOLE DESIGN ───────────────────────────────────────────────────────────
// The first cut had the dragon light FIVE SCATTERED SQUARES, which is the obvious reading of "lights tiles on
// fire" and it broke the game outright: check:bingo priced it at 618% return. The reason is worth writing down
// because it is not obvious until you measure it — every square on this card sits on THREE patterns at once (a
// row, a column, and for eight of them a diagonal), so five scattered free squares do not add five squares,
// they add fifteen near-completions spread across every line on the board. Six-line cards went from one in
// seven thousand to one in a hundred and forty, and the six-line pay is the jackpot.
//
// So the dragon makes a PASS. It enters at one edge and burns a straight trail across the card — a row, a
// column or a diagonal — and lights every cold square on that one line. Which is better on both counts:
//
//   IT IS BETTER TO WATCH. "A dragon flew across your card and set that whole row on fire" is a thing you can
//   see happen in one movement and describe afterwards. Five squares lighting up in unrelated places is a
//   status effect, not an event.
//
//   IT IS BOUNDED. A pass completes at most ONE line directly, and every other line it helps, it helps by
//   exactly one square. That is a feature that can be priced — 12% of cards, worth about a third of this
//   cabinet's return — instead of one that detonates the top of the paytable.
//
// The trail is only ever the COLD squares on the line it crosses, so a pass over a row you had four of burns
// the one square you needed, and the number of squares that actually catch fire is itself the drama.
const DRAGON_PATHS = (() => {
    const at = (col, row) => col * 5 + row;
    const paths = [];
    for (let row = 0; row < 5; row += 1) paths.push({ kind: "row", i: row, cells: [0, 1, 2, 3, 4].map((col) => at(col, row)) });
    for (let col = 0; col < 5; col += 1) paths.push({ kind: "col", i: col, cells: [0, 1, 2, 3, 4].map((row) => at(col, row)) });
    paths.push({ kind: "diag", i: 0, cells: [at(0, 0), at(1, 1), at(2, 2), at(3, 3), at(4, 4)] });
    paths.push({ kind: "diag", i: 1, cells: [at(4, 0), at(3, 1), at(2, 2), at(1, 3), at(0, 4)] });
    return paths;
})();
export { DRAGON_PATHS };

/**
 * The dragon's pass over one card, or null if it did not come.
 *
 * Returns `{ kind, i, cells, burnt }` — the whole flight, not just the result, because the screen has to
 * ANIMATE it: it needs the line the dragon flew along (so the sprite can travel it) as well as which squares
 * actually caught (so only the cold ones ignite). A function that returned the burnt cells alone would leave
 * the client guessing at the path, and it would guess wrong on any pass that burned nothing.
 *
 * `force` is the owner's trigger. It makes the dragon CERTAIN rather than making a special card, so the button
 * tests the real feature instead of a demonstration of it.
 */
export function dragonFor(card, drawn, rng = Math.random, { force = false } = {}) {
    if (!force && rng() >= DRAGON_CHANCE) return null;
    const hits = new Set(drawn);
    const path = DRAGON_PATHS[Math.floor(rng() * DRAGON_PATHS.length)];
    const burnt = path.cells.filter((at) => {
        const n = card[Math.floor(at / 5)][at % 5];
        // Never the free centre (it is already yours) and never a ball that already came out — a dragon that
        // lands on a square you had has given you nothing, and it would do that half the time.
        return n !== 0 && !hits.has(n);
    });
    return { kind: path.kind, i: path.i, cells: path.cells, burnt };
}

/** The cell indices a pass actually set alight. Null-safe, so callers can pass a dragon that never came. */
export const burntOf = (dragon) => dragon?.burnt || [];

// A square counts when the free centre is on it, the ball came out, or the dragon set it on fire. One
// predicate, used by every pattern below, so a new way of marking a square can never be honoured by the rows
// and forgotten by the diagonals.
const marked = (n, hits, burnt, at) => n === 0 || hits.has(n) || burnt.has(at);

/** Every line on the card: five rows, five columns, two diagonals. `burnt` is the dragon's cell indices. */
export function linesOf(card, drawn, burnt = []) {
    const hits = new Set(drawn);
    const fire = new Set(burnt);
    // Cell indices alongside the numbers, because a burning square is identified by WHERE it is and a drawn
    // one by WHAT it is — the two patterns need different keys and every line has to check both.
    const at = (col, row) => col * 5 + row;
    const lines = [];
    for (let row = 0; row < 5; row += 1) {
        lines.push({ kind: "row", i: row, cells: card.map((col) => col[row]), at: card.map((_, col) => at(col, row)) });
    }
    for (let col = 0; col < 5; col += 1) {
        lines.push({ kind: "col", i: col, cells: card[col], at: card[col].map((_, row) => at(col, row)) });
    }
    lines.push({ kind: "diag", i: 0, cells: [card[0][0], card[1][1], card[2][2], card[3][3], card[4][4]],
        at: [at(0, 0), at(1, 1), at(2, 2), at(3, 3), at(4, 4)] });
    lines.push({ kind: "diag", i: 1, cells: [card[4][0], card[3][1], card[2][2], card[1][3], card[0][4]],
        at: [at(4, 0), at(3, 1), at(2, 2), at(1, 3), at(0, 4)] });
    return lines.filter((l) => l.cells.every((n, k) => marked(n, hits, fire, l.at[k])));
}

export const cornersOf = (card, drawn, burnt = []) => {
    const hits = new Set(drawn);
    const fire = new Set(burnt);
    return [[0, 0], [4, 0], [0, 4], [4, 4]]
        .every(([col, row]) => marked(card[col][row], hits, fire, col * 5 + row));
};

// ── WHAT A CARD PAYS ─────────────────────────────────────────────────────────────────────────────────────────
// As a multiple of what the card cost, and built around one rule that can be said out loud:
//
//   A LINE GETS YOUR CARD BACK. Two lines is where it starts paying.
//
// A line lands on about a third of cards, so it is the thing that happens — and a machine that pays you 0.5x
// for the thing you were shouting about is a machine that made a fool of you. Paying it back exactly is the
// honest version: you got the line, you are level, play again.
//
// Forty of seventy-five is still nowhere near a full house — that needs all twenty-four numbers, which
// happens about once in a hundred billion cards — so this pays on LINES all the way up. Four corners is in
// there because it is the pattern everybody who has played in a hall is already watching for, and it is a
// consolation rather than a win: half the card back, on a card that got no line at all.
//
// Tuned against check:bingo, which deals two million cards against real draws.
// ── AND THE LADDER WAS REPRICED AROUND THE DRAGON ────────────────────────────────────────────────────────────
// These were 1 / 2.5 / 8 / 15 / 40 / 300, tuned for a card with no bonus on it and a return of 88% in GOLD.
// Two things moved at once and both push the same way:
//
//   THE DRAGON. A pass lands on one card in eight and is worth about a third of this cabinet's whole return.
//   Every rung above a single line got more frequent, so every rung above a single line has to pay less for
//   the same money.
//
//   THE CURRENCY. It pays CHIPS now, and the floor's rule for a chip game is 1.00x rather than the gold
//   ceiling's 88% — see the long note at the top of check:bingo. So there are twelve more points to spend,
//   and they are spent here rather than being handed to the top tier.
//
// A LINE STILL GETS YOUR CARD BACK, which is the one rule in this game worth saying out loud, and it is why
// `1` is untouched. Everything above it was solved for by check:bingo against two million real cards.
// ── RAISED TO MEET THE FLOOR, 2026-09-01 ─────────────────────────────────────────────────────────────────
// This table returned 67.2% while every cabinet on the floor returned 101-105%. Bingo was not a game with a
// house edge, it was the trap: two-thirds of the return of the thing next to it, for a player who has no way
// of knowing that. The whole ladder is multiplied by 1.41 so the SHAPE is untouched — the same one-in-two-
// thousand six-liner, the same corners consolation — and only the height moves.
export const BINGO_PAYS = {
    corners: 0.7,
    1: 1.4,
    2: 2.1,
    3: 7,
    4: 14,
    5: 35,
    6: 283,   // six lines or more — about one card in two thousand
};

/** The single source of truth for what one card won. The screen shows what this returned. */
export function scoreCard(card, drawn, burnt = []) {
    const lines = linesOf(card, drawn, burnt);
    const corners = cornersOf(card, drawn, burnt);
    const n = lines.length;
    // Best pattern only — the patterns are nested (three lines contains one line), so paying each of them
    // would be paying the same achievement three times. Corners only counts when nothing else did.
    if (n >= 1) {
        const tier = Math.min(6, n);
        return {
            mult: BINGO_PAYS[tier],
            label: n === 1 ? "a line" : `${n} lines`,
            tier: `line${tier}`,
            lines,
            corners,
        };
    }
    if (corners) return { mult: BINGO_PAYS.corners, label: "four corners", tier: "corners", lines, corners };
    return { mult: 0, label: null, tier: null, lines, corners };
}

// ── THE PATTERN OF THE DAY ───────────────────────────────────────────────────────────────────────────────────
// A shape, announced before you buy, that pays ON TOP of whatever lines the card makes. One per weekday, so it
// is a thing you can learn — Tuesday is the X — rather than a surprise you read after the fact.
//
// WHY THIS AND NOT A BIGGER PAYTABLE. Bingo's problem was never the money, it was the SHAPE of the money:
// against 400,000 simulated cards, 49% of them do nothing at all and another 33% make exactly one line, which
// pays your card back. Four cards in five end in "nothing happened" or "you are level". Raising the line pays
// moves the average and does not touch that: the modal card is still a shrug. A second, different thing to be
// watching for changes what you are doing during the forty balls, which is the actual complaint.
//
// ── AND EVERY ONE OF THEM IS PRICED THE SAME ─────────────────────────────────────────────────────────────────
// Each pattern's `pay` is set so that its rate x its pay is about +3% of stake, measured against 300,000 real
// cards through drawFor() and dragonFor() — so the day of the week never decides how good the game is, only
// what you are looking for. Bingo goes from 99.8% to about 102.8%, which is a RAISE and deliberately so: chips
// are one-way tickets and there is no path back to gold, so the ceiling protects nothing. check:bingo prints
// the total with the pattern folded in.
//
// The rates below are the measured ones. They include the dragon, because the dragon is part of the game and
// a pattern priced against a card without one would be priced against a card that does not exist.
const AT = (col, row) => col * 5 + row;
const ROW = (row) => [0, 1, 2, 3, 4].map((col) => AT(col, row));
const COL = (col) => [0, 1, 2, 3, 4].map((row) => AT(col, row));

export const PATTERNS = [
    // Sunday
    { id: "goblet", name: "The Goblet", blurb: "A cup, a stem and a foot.", pay: 5, rate: 0.0062,
        cells: [AT(0, 0), AT(4, 0), AT(1, 1), AT(3, 1), AT(2, 2), AT(2, 3), AT(1, 4), AT(2, 4), AT(3, 4)] },
    // Monday
    { id: "sixpack", name: "The Six-Pack", blurb: "Two by three, top left.", pay: 1.25, rate: 0.0238,
        cells: [AT(0, 0), AT(1, 0), AT(0, 1), AT(1, 1), AT(0, 2), AT(1, 2)] },
    // Tuesday
    { id: "x", name: "The X", blurb: "Both diagonals, corner to corner.", pay: 4, rate: 0.0071,
        cells: [...new Set([...[0, 1, 2, 3, 4].map((i) => AT(i, i)), ...[0, 1, 2, 3, 4].map((i) => AT(4 - i, i))])] },
    // Wednesday
    { id: "kite", name: "The Kite", blurb: "A block in the corner and a tail to the far one.", pay: 1.25, rate: 0.0244,
        cells: [AT(0, 0), AT(1, 0), AT(0, 1), AT(1, 1), AT(2, 2), AT(3, 3), AT(4, 4)] },
    // Thursday
    { id: "cross", name: "The Cross", blurb: "The middle row and the middle column.", pay: 4.5, rate: 0.0063,
        cells: [...new Set([...COL(2), ...ROW(2)])] },
    // Friday
    { id: "diamond", name: "The Diamond", blurb: "Point to point, around the free square.", pay: 5, rate: 0.0062,
        cells: [AT(2, 0), AT(1, 1), AT(3, 1), AT(0, 2), AT(4, 2), AT(1, 3), AT(3, 3), AT(2, 4)] },
    // Saturday — the rare one, and it is on the day the shop is busiest.
    { id: "toptail", name: "Top and Tail", blurb: "The whole top row and the whole bottom row.", pay: 15, rate: 0.0020,
        cells: [...ROW(0), ...ROW(4)] },
];

/**
 * Which pattern is up on a given store day key (`YYYY-MM-DD`).
 *
 * Keyed to the WEEKDAY rather than hashed, because the point is that it is learnable. The caller is handed the
 * key rather than working the date out here — this module is shared with the browser, and a client deciding
 * for itself what day it is in Montgomery is a client that disagrees with the till for five hours a night.
 */
export const patternFor = (weekday) => PATTERNS[((Number(weekday) || 0) % PATTERNS.length + PATTERNS.length) % PATTERNS.length];

/** Whether a card completed a pattern, and what it is worth. Same `marked` rule the lines use. */
export function patternAward(card, drawn, burnt = [], pattern = null) {
    if (!pattern?.cells?.length) return { hit: false, mult: 0 };
    const hits = new Set(drawn);
    const fire = new Set(burnt);
    const hit = pattern.cells.every((at) => marked(card[Math.floor(at / 5)][at % 5], hits, fire, at));
    return { hit, mult: hit ? pattern.pay : 0 };
}

// ── AND WHAT YOU ARE ONE SQUARE AWAY FROM ────────────────────────────────────────────────────────────────────
// Nothing on this screen ever told you that you were one number off a line. Forty balls came out and then it
// was over — so the tension the game is entirely made of was happening in the maths and nowhere else. This is
// what the screen needs to light: every line with exactly four of its five marked, and WHICH square is the
// one still cold, so the card can point at it and the caller can say it out loud.
//
// Recomputed per ball on the client, which is cheap — twelve lines of five — and correct by construction,
// because it uses the same `marked` predicate that decides what actually pays.
export function nearLinesOf(card, drawn, burnt = []) {
    const hits = new Set(drawn);
    const fire = new Set(burnt);
    const out = [];
    const consider = (kind, i, at) => {
        const cold = at.filter((k) => !marked(card[Math.floor(k / 5)][k % 5], hits, fire, k));
        if (cold.length === 1) out.push({ kind, i, at, need: cold[0], number: card[Math.floor(cold[0] / 5)][cold[0] % 5] });
    };
    for (let row = 0; row < 5; row += 1) consider("row", row, ROW(row));
    for (let col = 0; col < 5; col += 1) consider("col", col, COL(col));
    consider("diag", 0, [0, 1, 2, 3, 4].map((i) => AT(i, i)));
    consider("diag", 1, [0, 1, 2, 3, 4].map((i) => AT(4 - i, i)));
    return out;
}

/** What a caller would call a line. Columns get their letter, because that is how a hall says it. */
export const lineName = (l) => (l.kind === "row" ? `row ${l.i + 1}`
    : l.kind === "col" ? `the ${COLUMNS[l.i]} column`
        : "the diagonal");
