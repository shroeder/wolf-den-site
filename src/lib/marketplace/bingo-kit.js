// ── BINGO, AND WHY IT IS NOT KENO WITH A GRID ────────────────────────────────────────────────────────────────
// This floor already has a game where you pick numbers and the house draws some. Adding a second one with a
// nicer layout would be exactly the thing the three slot cabinets were built to avoid: one machine painted
// twice. So the reason bingo exists here is the one thing no other machine on the floor has —
//
//   EVERYBODY IN THE ROOM PLAYS THE SAME DRAW.
//
// The forty balls belong to a ROUND, not to a player. Anyone who buys a card in the same three-minute window
// is watching the same numbers come out, which is the entire ritual of bingo and the only part of it that a
// solo game cannot reproduce. The card is still yours and still random, so the odds are identical whether you
// are alone or the floor is full — what changes is whether anyone is there to groan with you.
//
// NO ROUNDS TABLE. The round is derived from the clock: `roundOf(now)` is a number, the draw is a seeded
// shuffle of that number, and the whole thing needs no scheduler, no cron and no row. A game that needs a
// timer to advance is a game that stops when the timer does.
//
// THE DRAW IS SEEDED SERVER-SIDE and salted, but this is belt-and-braces rather than load-bearing: a random
// card against a KNOWN set of forty balls has exactly the same odds as against an unknown one. There is no
// version of seeing the draw early that helps you, which is worth stating so nobody later "fixes" it into
// something slower for no reason.

/** How long one round's numbers stand. Three minutes: long enough to walk over and buy in, short enough that
 *  nobody is waiting around for the next one. */
export const ROUND_MS = 3 * 60 * 1000;

export const BALLS = 75;
// FORTY BALLS, and the number is load-bearing. At thirty, a card paid something on 15.7% of deals — and this
// is the one game on the floor with a WAIT in it. A wait that ends in nothing five times in six is the worst
// thing a game can ask of anybody, however good its average is. Forty pays on 46% of cards.
export const DRAWN = 40;
/** Five columns of fifteen, the way a bingo card has always been laid out: B is 1-15, I is 16-30, and so on. */
export const COLUMNS = ["B", "I", "N", "G", "O"];
export const PER_COLUMN = 15;

export const roundOf = (nowMs) => Math.floor(nowMs / ROUND_MS);
export const roundEndsAt = (round) => (round + 1) * ROUND_MS;

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

/** The forty balls for a round. Drawn in order, because the order is the show. */
export function drawFor(round, salt = 0) {
    const rng = seeded((round * 2654435761 + salt) >>> 0);
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

const marked = (n, hits) => n === 0 || hits.has(n);

/** Every line on the card: five rows, five columns, two diagonals. */
export function linesOf(card, drawn) {
    const hits = new Set(drawn);
    const lines = [];
    for (let row = 0; row < 5; row += 1) {
        lines.push({ kind: "row", i: row, cells: card.map((col) => col[row]) });
    }
    for (let col = 0; col < 5; col += 1) {
        lines.push({ kind: "col", i: col, cells: card[col] });
    }
    lines.push({ kind: "diag", i: 0, cells: [card[0][0], card[1][1], card[2][2], card[3][3], card[4][4]] });
    lines.push({ kind: "diag", i: 1, cells: [card[4][0], card[3][1], card[2][2], card[1][3], card[0][4]] });
    return lines.filter((l) => l.cells.every((n) => marked(n, hits)));
}

export const cornersOf = (card, drawn) => {
    const hits = new Set(drawn);
    return [card[0][0], card[4][0], card[0][4], card[4][4]].every((n) => marked(n, hits));
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
export const BINGO_PAYS = {
    corners: 0.5,
    1: 1,
    2: 2.5,
    3: 8,
    4: 15,
    5: 40,
    6: 300,   // six lines or more — about one card in seven thousand
};

/** The single source of truth for what one card won. The screen shows what this returned. */
export function scoreCard(card, drawn) {
    const lines = linesOf(card, drawn);
    const corners = cornersOf(card, drawn);
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
