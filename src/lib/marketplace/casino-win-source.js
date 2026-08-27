// ── WHERE A CHIP CAME FROM ───────────────────────────────────────────────────────────────────────────────────
// Luke: "I need to be able to drill in and see how they won it by slot machine, and if it was from the bonus
// or just a normal win on a pay line, or if it was from keno."
//
// A five-reel spin can pay from eight different places at once and the ledger recorded ONE number for the lot.
// The meta it did carry — `base`, `free`, `locked` — was three of those eight, so the commonest question ("was
// that a payline or a bonus") was unanswerable for most wins: a 19-chip win on The Colossal came back
// base 0, free 0, locked 0, because the second screen's total is not in `base` and never was.
//
// So the sources are named ONCE, here, and both ends of the pipe use this file: the play path splits a payout
// with `spinSources` and the admin report labels and rolls it up with `SOURCE_LABEL` / `isBonus`. A second list
// of source names living in the report is a report that goes quietly wrong the day a cabinet grows a feature.
//
// ── AND THE SPLIT IS IN GOLD, CONVERTED ONCE ─────────────────────────────────────────────────────────────────
// The engine works in gold (multiples of the bet); the payout is converted to chips once, at the end. So the
// split is computed in the engine's units and then allocated across the chips actually paid — see splitChips,
// which allocates rather than rounds, so the parts always sum to the whole.

/** Every place a payout can come from, in the order a report should read them. */
export const WIN_SOURCES = ["line", "colossal", "free", "sticky", "hold", "warren", "gems", "again", "other"];

export const SOURCE_LABEL = {
    line: "Pay line",
    colossal: "Colossal reels",
    free: "Free spins",
    sticky: "Sticky wilds",
    hold: "Hold & spin",
    warren: "The Warren",
    gems: "Gem vault",
    again: "Win it again",
    other: "Unattributed",
    // The other games do not have a base/bonus split of their own, so they name themselves.
    keno: "Keno",
    bingo: "Bingo",
    blackjack: "Blackjack",
};

// ── WHAT COUNTS AS A BONUS ───────────────────────────────────────────────────────────────────────────────────
// The reels paying is the base game, and that includes the colossal block and a cascade chain: both are things
// the SPIN did, on the spin you paid for. A bonus is a round the machine takes you into — free spins, sticky
// wilds, hold & spin, the warren, the vault, and the meter firing.
const BONUS = new Set(["free", "sticky", "hold", "warren", "gems", "again"]);
export const isBonus = (source) => BONUS.has(source);

/**
 * What each part of a five-reel spin paid, in GOLD (the engine's own units).
 *
 * `other` is deliberate and is the reason this can be trusted: it is the spin's total minus everything named,
 * so a feature added to a cabinet without being added here shows up as an unattributed column in the report
 * instead of silently inflating "pay line". A number nobody can explain is better than a wrong explanation.
 */
export function spinSources(r, bet) {
    const stake = Math.max(1, Number(bet) || 0);
    const col = r?.colossal;
    const src = {
        line: Number(r?.base?.total) || 0,
        // The colossal block and its scatter are part of the SPIN — `base` on that cabinet is the main grid
        // only, which is what made those wins look like they came from nowhere.
        colossal: col ? (Number(col.colTotal) || 0) + (Number(col.scatterWin) || 0) : 0,
        free: Number(r?.free?.total) || 0,
        sticky: Number(r?.locked?.total) || 0,
        hold: Number(r?.hold?.total) || 0,
        warren: Number(r?.warren?.total) || 0,
        gems: Number(r?.gems?.total) || 0,
        // The meter pays a row of MULTIPLES, so it is the one source that has to be converted to gold here.
        again: r?.winAgain ? (Number(r.winAgain.paid) || 0) * stake : 0,
        other: 0,
    };
    const named = WIN_SOURCES.reduce((a, k) => a + src[k], 0);
    // A hundredth of a chip is float noise from summing eight sub-totals, not an unexplained payout. Without
    // this floor every ordinary spin reports a phantom "unattributed" source and the column stops meaning
    // anything the moment a real one appears in it.
    const rest = (Number(r?.total) || 0) - named;
    src.other = rest > 0.01 ? rest : 0;
    return src;
}

/**
 * Hand `won` chips out across the gold split, so the parts sum to exactly what was paid.
 *
 * Largest remainder, not per-part rounding: rounding each share on its own loses or invents chips, and a
 * breakdown whose columns do not add up to the payout beside them is a breakdown nobody will trust twice.
 */
export function splitChips(won, gold) {
    const out = {};
    const total = Object.values(gold).reduce((a, n) => a + (Number(n) || 0), 0);
    const paid = Math.max(0, Math.round(Number(won) || 0));
    if (!paid || total <= 0) {
        for (const k of Object.keys(gold)) if (gold[k] > 0) out[k] = 0;
        return out;
    }
    const parts = Object.entries(gold).filter(([, v]) => (Number(v) || 0) > 0)
        .map(([k, v]) => ({ k, exact: (Number(v) / total) * paid }));
    if (!parts.length) return out;
    let left = paid;
    for (const p of parts) { p.n = Math.floor(p.exact); left -= p.n; }
    parts.sort((a, b) => (b.exact - b.n) - (a.exact - a.n));
    for (let i = 0; i < left; i += 1) parts[i % parts.length].n += 1;
    for (const p of parts) out[p.k] = p.n;
    return out;
}
