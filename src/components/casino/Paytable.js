"use client";

import { useMemo } from "react";
import { SLOTS5, lookFor, symbolName, LINES } from "@/lib/marketplace/casino-slot5.js";

// ── WHAT IT PAYS ─────────────────────────────────────────────────────────────────────────────────────────────
// Every real cabinet has this behind a button and it is not decoration: a slot machine is the only game in the
// building whose rules are invisible while you play it. You can watch a blackjack hand and work out what
// happened; you cannot watch a reel and work out that four bones beat three laurels, or that the moon does not
// pay on a line at all. Without this screen a member is pressing a button and being told a number.
//
// IN CHIPS, AT THE BET THEY HAVE SET. Not in multiples of a line bet, which is the honest unit and completely
// useless — "400x" means nothing when the thing being multiplied is a twentieth of the stake and nobody has
// been told that. The numbers move when the bet moves, which is also the clearest possible way of showing what
// raising the bet actually buys.
//
// ONE COMPONENT FOR BOTH CABINET SHAPES. The five-reel machines pay on 3, 4 and 5 from the left; the three-reel
// ones pay on pairs and triples. Same table, different columns, because a member walking from one to the other
// should not have to learn a second way of reading the same thing.

// ── THE SAME ART THE REELS USE ───────────────────────────────────────────────────────────────────────────────
// A naked path was wrong and looked fine on the only cabinet that was checked. Reel art is resolved through a
// map the SERVER builds (see themeArt): several machines draw their symbols from the Den's own sprites — pets,
// fish, foes — which live on Blob and have no predictable filename, and only three cabinets have a generic
// set on disk at all. So The Menagerie's paytable was five broken-image icons.
//
// Same resolver, same fallback, one place. If the reels can draw it, so can this.
const artFor = (art, machineId, sym) => art?.[machineId]?.[sym] || `/images/casino/reels/${machineId}-${sym}.webp`;
// WHAT THIS CABINET CALLS IT. The symbol ids are shared across all five machines and the art is not, so
// capitalising the id printed "Wolf" under a picture of a jam roll on The Harvest and under a cut amethyst
// on The Vault. The name comes from the same map the colour does.
const pretty = (id, machineId) => symbolName(id, machineId);

const ROLE_WORD = {
    wild: "WILD",
    scatter: "SCATTER",
    bonus: "BONUS",
};

/** The five-reel table: every paying symbol, best first, in chips at this bet. */
function rowsForFive(machineId, bet, rate) {
    const m = SLOTS5[machineId];
    if (!m) return null;
    const lineBet = bet / LINES.length;
    const chips = (mult) => Math.max(1, Math.round(lineBet * mult * rate));
    const rows = Object.entries(m.pays)
        .map(([id, by]) => ({
            id,
            role: lookFor(machineId, id)?.role || "low",
            tone: lookFor(machineId, id)?.tone || "#cbd3dc",
            cells: [3, 4, 5].map((n) => (by[n] ? chips(by[n]) : null)),
        }))
        .sort((a, b) => (b.cells[2] || 0) - (a.cells[2] || 0));
    // The scatter is not on the list above because it does not pay on a line — it pays from anywhere, on the
    // WHOLE bet, which is a different sum and has to be shown as one.
    const sc = {
        id: m.scatter,
        role: "scatter",
        tone: lookFor(machineId, m.scatter)?.tone || "#cbd3dc",
        cells: [3, 4, 5].map((n) => (m.scatterPays[n] ? Math.max(1, Math.round(bet * m.scatterPays[n] * rate)) : null)),
    };
    return { rows: [...rows, sc], heads: ["3", "4", "5"], m };
}

/**
 * The three-reel table: pairs and triples, in GOLD — those cabinets have not been converted and still pay
 * the currency you staked.
 *
 * MULTIPLIED BY THE BET, like the five-reel one. The first cut printed the raw table (`wolf: 200`) under a
 * heading that said chips, which was wrong twice over: wrong currency, and a number that is a multiplier
 * rather than a payout. 200 on a 100 bet is twenty thousand gold, and "200" is the one thing it is not.
 */
function rowsForThree(table, bet) {
    if (!table?.pays) return null;
    const three = table.pays.three || {};
    const two = table.pays.two || {};
    const at = (v) => (v ? Math.max(1, Math.round(v * bet)) : null);
    const ids = [...new Set([...Object.keys(three), ...Object.keys(two)])];
    const rows = ids
        .map((id) => ({ id, role: table.scatter?.id === id ? "scatter" : "low", tone: "#cbd3dc",
            cells: [at(two[id]), at(three[id])] }))
        .sort((a, b) => (b.cells[1] || 0) - (a.cells[1] || 0));
    return { rows, heads: ["2", "3"], m: null };
}

export default function Paytable({ machineId, kind, table, art, bet, rate = 0.25, onClose }) {
    const built = useMemo(
        () => (kind === "five" ? rowsForFive(machineId, bet, rate) : rowsForThree(table, bet)),
        [kind, machineId, bet, rate, table],
    );
    if (!built) return null;
    const { rows, heads, m } = built;
    // Which symbols have no three-of-a-kind pay. Derived from the same `rows` the grid renders, so the
    // sentence underneath can never disagree with the dashes above it.
    const shortLadders = rows
        .filter((r) => r.role !== "scatter" && !r.cells[0])
        .map((r) => ({ id: r.id, tone: r.tone, from: r.cells[1] ? "four" : "five" }));

    return (
        <div className="pt-scrim" role="dialog" aria-modal="true" aria-label="What this machine pays"
            onClick={onClose}>
            {/* The card stops the click, so tapping the card does not close what you opened to read. */}
            <div className="pt" onClick={(e) => e.stopPropagation()}>
                <div className="pt-head">
                    <b>What it pays</b>
                    <button type="button" className="pt-x" onClick={onClose} aria-label="Close">✕</button>
                </div>
                {/* THE UNIT IS NOT THE SAME ON EVERY CABINET. The five-reel machines pay chips; the ones
                    that have not been rebuilt still pay the gold you staked. Saying "chips" on both was the
                    kind of wrong that a member only finds out by being paid something else. */}
                <p className="pt-sub">
                    In {kind === "five" ? "chips" : "gold"}, at a bet of <b>{bet.toLocaleString()}</b>
                    {kind === "five" ? <> across {LINES.length} lines</> : null}. Raise the bet and every number
                    here rises with it.
                </p>

                <div className="pt-grid">
                    <div className="pt-row pt-heads">
                        <span />
                        {heads.map((h) => <i key={h}>{h}</i>)}
                    </div>
                    {rows.map((r) => (
                        <div key={r.id} className={`pt-row is-${r.role}`} style={{ "--tone": r.tone }}>
                            <span className="pt-what">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={artFor(art, machineId, r.id)} alt="" />
                                <em>
                                    {pretty(r.id, machineId)}
                                    {ROLE_WORD[r.role] ? <u>{ROLE_WORD[r.role]}</u> : null}
                                </em>
                            </span>
                            {r.cells.map((c, i) => (
                                <b key={i} className={c ? "" : "is-none"}>{c ? c.toLocaleString() : "—"}</b>
                            ))}
                        </div>
                    ))}
                </div>

                {/* ── AND THE TWENTY LINES, DRAWN ──────────────────────────────────────────────────────
                    Luke, three boards running: "what are the paylines? The blue three across the bottom
                    isn't one?" — and then "again, not a payline for both blues and the orange?"

                    He was reading the board correctly every time. The bottom row IS line 3 of 20. The
                    machine has advertised "twenty lines" since it shipped and has never once shown them,
                    so the only way to know whether a run of three sits on one was to have the table in
                    your head. A slot that will not show its lines is asking you to take its word for it.

                    Twenty little 5x3 grids, the shape drawn on each. Cheap, and it ends the argument. */}
                {m ? (
                    <div className="pt-lines">
                        <h5>The {LINES.length} lines</h5>
                        <div className="pt-lines-grid">
                            {LINES.map((line, i) => (
                                <div key={i} className="pt-line">
                                    <span className="pt-line-cells" aria-hidden="true">
                                        {Array.from({ length: 3 }, (_, row) => (
                                            Array.from({ length: 5 }, (_, reel) => (
                                                <i key={`${row}-${reel}`}
                                                    className={line[reel] === row ? "is-on" : ""} />
                                            ))
                                        ))}
                                    </span>
                                    <u>{i + 1}</u>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* ── THE THREE THINGS A TABLE OF NUMBERS CANNOT SAY ───────────────────────────────────
                    A grid shows what each symbol is worth and nothing about how the machine works. These are
                    the rules that decide whether the grid ever applies, and every one of them is invisible on
                    the reels. */}
                {m ? (
                    <ul className="pt-notes">
                        <li>Lines pay <b>left to right</b> from the first reel. A run that starts on reel two pays nothing.</li>
                        {/* A dash in a small grid is not an answer to "why did three of these pay me nothing".
                            Said in words, naming the symbols, because this is the single most confusing thing
                            about the machine — on the cabinets that tumble it is most of the paytable. */}
                        {shortLadders.length ? (
                            <li>
                                {shortLadders.map((r, i) => (
                                    <span key={r.id}>
                                        {i > 0 ? (i === shortLadders.length - 1 ? " and " : ", ") : null}
                                        <b style={{ color: r.tone }}>{pretty(r.id, machineId)}</b> pays from <b>{r.from}</b>
                                    </span>
                                ))}
                                {" "}— three on a line is not a win for {shortLadders.length > 1 ? "those" : "that one"}.
                            </li>
                        ) : null}
                        <li>
                            <b style={{ color: lookFor(machineId, m.wild)?.tone }}>{pretty(m.wild, machineId)}</b> is <b>wild</b> —
                            it stands in for any symbol except the {pretty(m.scatter, machineId)}, and it only appears on the middle three reels.
                        </li>
                        <li>
                            <b style={{ color: lookFor(machineId, m.scatter)?.tone }}>{pretty(m.scatter, machineId)}</b> pays from
                            <b> anywhere</b>, on your whole bet rather than on a line. Three of them open the free spins.
                        </li>
                        <li>
                            {m.second?.kind === "hold"
                                ? <>{m.second.need} <b style={{ color: lookFor(machineId, m.second.trigger)?.tone }}>{pretty(m.second.trigger, machineId)}s</b> anywhere open <b>{m.second.label}</b> — they lock, and every new one buys three more respins.</>
                                : <>Five <b style={{ color: lookFor(machineId, m.bonus)?.tone }}>{pretty(m.bonus, machineId)}s</b> anywhere open <b>{m.second?.label || "the second round"}</b>.</>}
                        </li>
                        <li>The free round here: <b>{m.free?.label}</b>.</li>
                    </ul>
                ) : null}
            </div>
        </div>
    );
}
