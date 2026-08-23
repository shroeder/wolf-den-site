"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";

// ── THE FIVE-REEL MACHINE ────────────────────────────────────────────────────────────────────────────────────
// Five reels, three rows, twenty lines. The maths is entirely server-side (casino-slot5.js) and this screen
// computes nothing: it is handed a finished grid, the lines that paid and what the features did, and its whole
// job is to reveal that in an order that is worth watching.
//
// THE ORDER IS THE GAME. A slot machine is a reveal with a spreadsheet behind it, and the reveal is the part
// people come for: reels land left to right so the last one decides, matching symbols on reels one and two
// make the third reel matter, and the money is counted UP rather than stated. None of that changes a single
// payout — it is all pacing — and it is the difference between a machine and a receipt printer.

const REELS = 5;
const ROWS = 3;
// Per-reel release, then the settle. Same shape as the three-reel cabinet next door, and the same rule: the
// sound is timed off THESE numbers rather than a second copy of them, because that drift cost us 620ms once
// already. See the reel clock in CasinoClient.
const STOP_AT = [0, 150, 300, 460, 660];
const SETTLE_MS = 340;
const LANDS_AT = STOP_AT.map((t) => t + SETTLE_MS);
// How long each winning line is drawn before the next one, when several paid.
const LINE_MS = 620;
// Below this a win is not celebrated — see CELEBRATE_AT in casino-slot5-play.js. Seven wins in ten on a
// twenty-line machine pay back less than the stake; that is what twenty lines buys, and a machine that
// throws a fanfare at every one of them is doing the exact thing this rework existed to stop.
const CELEBRATE_AT = 1;
const BIG_WIN_AT = 10;

const art = (machineId, sym) => `/images/casino/reels/${machineId}-${sym}.webp`;

// The strip a reel runs before it stops: filler, then the three symbols it is actually going to show. The
// filler is drawn from the machine's own symbols so a spinning reel looks like this cabinet rather than a
// generic blur.
function stripFor(pool, land) {
    const run = Array.from({ length: 9 }, () => pool[Math.floor(Math.random() * pool.length)]);
    return [...run, ...land];
}

export default function Slot5({ machineId = "slot", symbols, lines, onSpin, gold, chips, bet, busy }) {
    const [grid, setGrid] = useState(null);        // what is on screen now
    const [spinning, setSpinning] = useState(false);
    const [landed, setLanded] = useState(0);       // how many reels have come to rest
    const [result, setResult] = useState(null);    // the whole server response
    const [showLine, setShowLine] = useState(-1);  // which winning line is being drawn
    const [counted, setCounted] = useState(0);     // the chip counter, ticking up
    const [phase, setPhase] = useState("idle");    // idle | spin | lines | free | pick | done
    const [offer, setOffer] = useState("mid");
    const [picked, setPicked] = useState([]);      // chests turned over so far
    const timers = useRef([]);

    const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
    useEffect(() => () => clearTimers(), [clearTimers]);

    const pool = useMemo(() => symbols || ["wolf", "chest", "laurel", "doubloon", "bone", "moon"], [symbols]);

    // ── PULLING ──────────────────────────────────────────────────────────────────────────────────────────
    const pull = useCallback(async () => {
        if (busy || spinning) return;
        unlock();
        clearTimers();
        setResult(null); setShowLine(-1); setCounted(0); setPicked([]); setLanded(0);
        setPhase("spin"); setSpinning(true);
        Cas.pull();

        const r = await onSpin(offer);
        if (!r?.ok) { setSpinning(false); setPhase("idle"); return; }

        setResult(r);
        setGrid(r.grid);
        setSpinning(false);

        // Each reel comes to rest on its own clock, and says so.
        STOP_AT.forEach((_, i) => {
            timers.current.push(setTimeout(() => {
                setLanded(i + 1);
                Cas.reelStop(i, i === REELS - 1 ? 0.85 : 0.4);
                Haptic.hit(i === REELS - 1 ? 0.5 : 0.3);
                // TWO SCATTERS SHOWING AND THREE REELS TO GO. The riser is handed the exact gap left, so it
                // stops climbing at the instant the reel stops rather than telling you the answer early.
                if (i === 2 && r.scatters >= 2) Cas.anticipate(LANDS_AT[4] - LANDS_AT[2]);
            }, LANDS_AT[i]));
        });

        // Then the lines, one at a time.
        const after = LANDS_AT[REELS - 1] + 260;
        timers.current.push(setTimeout(() => {
            if (!r.lines.length && !r.scatterWin) { setPhase(r.free || r.pick ? "free" : "done"); return; }
            setPhase("lines");
            r.lines.forEach((_, i) => {
                timers.current.push(setTimeout(() => { setShowLine(i); Cas.coin(i % 5); }, i * LINE_MS));
            });
            timers.current.push(setTimeout(() => {
                setShowLine(-1);
                setPhase(r.free ? "free" : r.pick ? "pick" : "done");
            }, r.lines.length * LINE_MS));
        }, after));
    }, [busy, spinning, onSpin, offer, clearTimers]);

    // ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────────
    // Counted up rather than stated. A number that lands already-final is a receipt; a number climbing is the
    // only part of a win that lasts longer than a second.
    useEffect(() => {
        if (!result?.wonChips || phase === "spin") return undefined;
        const target = result.wonChips;
        if (counted >= target) return undefined;
        const step = Math.max(1, Math.round(target / 26));
        const t = setTimeout(() => setCounted((n) => Math.min(target, n + step)), 34);
        return () => clearTimeout(t);
    }, [result, counted, phase]);

    // The horns, once, and only for a win that actually beat the stake.
    const celebrated = useRef(false);
    useEffect(() => {
        if (!result || phase === "spin") { return; }
        if (celebrated.current) return;
        const x = result.multiple || 0;
        if (x >= BIG_WIN_AT) { celebrated.current = true; Cas.jackpot(); Haptic.crit(); }
        else if (x >= CELEBRATE_AT) { celebrated.current = true; Cas.coins(Math.min(1, x / 20)); }
    }, [result, phase]);
    useEffect(() => { if (phase === "spin") celebrated.current = false; }, [phase]);

    // ── THE PICK ─────────────────────────────────────────────────────────────────────────────────────────
    // The board was decided on the server before the first tap — the order is in the response — so turning a
    // chest over reveals rather than decides. That is how every real pick bonus works and it is the only way
    // it can be checked; what the taps buy is the ORDER you learn it in, which is the whole tension.
    const turn = useCallback((i) => {
        if (!result?.pick || i !== picked.length) return;
        const card = result.pick.picked[i];
        setPicked((p) => [...p, i]);
        if (card.kind === "end") { Cas.lose(); setPhase("done"); }
        else if (card.kind === "mult") { Cas.multUp(card.value); Haptic.crit(); }
        else { Cas.coins(0.35); }
    }, [result, picked]);

    const lit = useMemo(() => {
        if (phase !== "lines" || showLine < 0 || !result) return null;
        const w = result.lines[showLine];
        if (!w) return null;
        return { line: lines[w.line], count: w.count, symbol: w.symbol, amount: w.amount };
    }, [phase, showLine, result, lines]);

    return (
        <div className="s5">
            {/* ── THE GRID ────────────────────────────────────────────────────────────────────────────── */}
            <div className="s5-window">
                <div className="s5-grid">
                    {Array.from({ length: REELS }, (_, reel) => (
                        <div key={reel} className={`s5-reel${landed > reel ? " is-stop" : spinning || result ? " is-spin" : ""}`}
                            style={{ "--settle": `${SETTLE_MS}ms`, "--delay": `${STOP_AT[reel]}ms` }}>
                            <div className="s5-strip">
                                {(grid && landed > reel ? grid[reel] : stripFor(pool, grid?.[reel] || pool.slice(0, 3))).map((sym, i) => (
                                    <span className="s5-cell" key={i}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={art(machineId, sym)} alt="" draggable="false"
                                            className={lit && lit.line[reel] === (i % ROWS) && reel < lit.count ? "is-lit" : ""} />
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                {/* The winning line, drawn across the window. One at a time — five lines flashing at once is
                    a light show nobody can read, and reading it is the entire point. */}
                {lit ? (
                    <svg className="s5-lines" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                        <polyline points={lit.line.map((row, reel) => `${reel * 20 + 10},${row * 20 + 10}`).join(" ")} />
                    </svg>
                ) : null}
            </div>

            {/* ── WHAT JUST HAPPENED ──────────────────────────────────────────────────────────────────── */}
            <div className="s5-say">
                {phase === "spin" ? <span className="s5-dim">…</span>
                    : lit ? <span><b>{lit.count}</b> {lit.symbol} — <b>{Math.round(lit.amount * (result?.rate || 1))}</b> chips</span>
                    : result?.wonChips ? <span className="s5-won"><b>{counted.toLocaleString()}</b> chips</span>
                    : result ? <span className="s5-dim">No line this time.</span>
                    : <span className="s5-dim">Twenty lines. Pick your deal and pull.</span>}
            </div>

            {/* ── THE DEAL, CHOSEN BEFORE YOU SPIN ────────────────────────────────────────────────────── */}
            {/* All three are worth the same to within half a percent — measured, and the gate fails if they
                drift. So this is a real choice about the SHAPE of a round rather than a quiz with a right
                answer, and it is asked UP FRONT: a choice offered at the moment it triggers is a choice made
                after you already know it triggered, which is a menu, not a decision. */}
            <div className="s5-offers" role="radiogroup" aria-label="Free spins deal">
                {[["many", "20 spins", "×2"], ["mid", "10 spins", "×4"], ["few", "7 spins", "sticky wilds"]].map(([id, a, b]) => (
                    <button key={id} type="button" role="radio" aria-checked={offer === id}
                        className={`s5-offer${offer === id ? " is-on" : ""}`} onClick={() => { setOffer(id); Cas.chips(); }}>
                        <b>{a}</b><i>{b}</i>
                    </button>
                ))}
            </div>

            {/* ── THE FREE SPINS ──────────────────────────────────────────────────────────────────────── */}
            {phase === "free" && result?.free ? (
                <div className="s5-feature">
                    <h4>The moon is up — {result.free.label}</h4>
                    <p>{result.free.spins.length} spins ran. <b>{Math.round(result.free.total * (result.rate || 1)).toLocaleString()}</b> chips.</p>
                    <button type="button" className="s5-go" onClick={() => setPhase(result.pick ? "pick" : "done")}>Go on</button>
                </div>
            ) : null}

            {/* ── THE PICK ────────────────────────────────────────────────────────────────────────────── */}
            {phase === "pick" && result?.pick ? (
                <div className="s5-feature">
                    <h4>Four chests. Keep going until one ends it.</h4>
                    <div className="s5-board">
                        {result.pick.picked.map((card, i) => (
                            <button key={i} type="button" className={`s5-chest${picked.includes(i) ? " is-open" : ""}`}
                                disabled={i !== picked.length} onClick={() => turn(i)}>
                                {picked.includes(i)
                                    ? (card.kind === "end" ? "✕" : card.kind === "mult" ? `×${card.value}` : card.value)
                                    : "?"}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            <button type="button" className="s5-pull" onClick={pull} disabled={busy || spinning || phase === "pick"}>
                {spinning ? "…" : `Spin · ${bet.toLocaleString()}`}
            </button>
            <p className="s5-purse">
                <span>{Number(gold || 0).toLocaleString()} gold</span>
                <span className="s5-chipcount">{Number(chips || 0).toLocaleString()} chips</span>
            </p>
        </div>
    );
}
