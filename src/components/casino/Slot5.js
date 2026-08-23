"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";
import { symbolTone, symbolRole, slot5 } from "@/lib/marketplace/casino-slot5.js";

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

// The strip a reel runs before it stops: filler, then the three symbols it is actually going to show.
//
// THE FILLER COMES FROM THAT REEL'S OWN STRIP, not from the machine's symbol list. On The Hunt the wild is
// weighted 0 on reels one and five — that is what makes five-of-a-kind affordable — so a generic filler
// showed wolves spinning past in columns they can never land in, and stood one at the top of reel one while
// the machine sat idle. The cabinet next door already has this written on it: a machine teasing a symbol
// that is not on its reels is the one thing a paytable must never do.
//
// Weighted, too, so the blur is made of the symbols this reel is actually full of.
function stripFor(bag, land) {
    const keys = Object.keys(bag).filter((k) => bag[k] > 0);
    const total = keys.reduce((a, k) => a + bag[k], 0);
    const draw = () => {
        let r = Math.random() * total;
        for (const k of keys) { r -= bag[k]; if (r <= 0) return k; }
        return keys[keys.length - 1];
    };
    return [...Array.from({ length: 9 }, draw), ...land];
}

export default function Slot5({ machineId = "slot", lines, onSpin, gold, chips, bet, onBet, stakes = [25, 100, 500, 2500], busy }) {
    const [grid, setGrid] = useState(null);        // what is on screen now
    const [spinning, setSpinning] = useState(false);
    const [landed, setLanded] = useState(0);       // how many reels have come to rest
    const [result, setResult] = useState(null);    // the whole server response
    const [showLine, setShowLine] = useState(-1);  // which winning line is being drawn
    const [counted, setCounted] = useState(0);     // the chip counter, ticking up
    const [phase, setPhase] = useState("idle");    // idle | spin | lines | free | pick | done
    const [picked, setPicked] = useState([]);      // chests turned over so far
    const timers = useRef([]);

    // Where this bet sits in the ladder, so the stepper can move along it. Derived rather than stored: the
    // bet is owned by the room (every cabinet shares it) and a second copy here would drift from it.
    const betIndex = Math.max(0, stakes.indexOf(bet));
    const locked = busy || spinning || phase === "pick";
    const step = (d) => {
        const next = stakes[Math.min(stakes.length - 1, Math.max(0, betIndex + d))];
        if (next !== bet) { onBet?.(next); Cas.chips(); }
    };

    const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
    useEffect(() => () => clearTimers(), [clearTimers]);

    // One bag per reel, off the machine's real strips — see stripFor.
    const strips = useMemo(() => slot5(machineId).strips, [machineId]);

    // ── A MACHINE NOBODY IS PLAYING SITS STILL ───────────────────────────────────────────────────────
    // Luke: "dont have this screen iterate over random symbols when you arent playing it."
    //
    // It did, and it was not an animation — it was a bug that looked like one. `stripFor` was being called
    // INSIDE the render, so every re-render drew a fresh set of random symbols, and this screen re-renders
    // for reasons that have nothing to do with the reels: the Pot ticking up, the purse changing, a message
    // arriving. The machine appeared to be idly playing itself in front of you, which is both wrong and a
    // small lie about what a reel does when it is not moving.
    //
    // Both faces are drawn ONCE and held. `idle` is what the machine shows before its first spin and never
    // changes; `filler` is the blur a reel runs during a spin, regenerated in pull() so two spins in a row
    // do not run the same picture past you — but regenerated on a TAP, not on a render.
    const [idle] = useState(() => slot5(machineId).strips.map((bag) => stripFor(bag, []).slice(0, ROWS)));
    const [filler, setFiller] = useState(() => slot5(machineId).strips.map((bag) => stripFor(bag, [])));

    // ── PULLING ──────────────────────────────────────────────────────────────────────────────────────────
    const pull = useCallback(async () => {
        if (busy || spinning) return;
        unlock();
        clearTimers();
        setResult(null); setShowLine(-1); setCounted(0); setPicked([]); setLanded(0);
        setPhase("spin"); setSpinning(true);
        setFiller(strips.map((bag) => stripFor(bag, [])));
        Cas.pull();

        // The middle deal, always — see the note where the chooser used to be.
        const r = await onSpin("mid");
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
    }, [busy, spinning, onSpin, clearTimers]);

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
        return { line: lines[w.line], count: w.count, symbol: w.symbol, chips: w.chips };
    }, [phase, showLine, result, lines]);

    return (
        <div className="s5">
            {/* ── THE GRID ────────────────────────────────────────────────────────────────────────────── */}
            {/* ── A MACHINE, NOT A GRID ON A PAGE ─────────────────────────────────────────────────────
                Luke: "setting the slot machine screen apart from the background." It was a dark grid on a
                dark page with a hairline border, which reads as a table. A real cabinet is an OBJECT: a
                brass frame with weight to it, a recessed glass panel that is visibly deeper than the
                surface around it, and a lit marquee saying which machine you are at. */}
            <div className="s5-cab">
                <span className="s5-marquee" aria-hidden="true"><i />THE HUNT<i /></span>
            <div className="s5-window">
                <div className="s5-grid">
                    {Array.from({ length: REELS }, (_, reel) => (
                        <div key={reel} className={`s5-reel${landed > reel ? " is-stop" : spinning || result ? " is-spin" : ""}`}
                            style={{ "--settle": `${SETTLE_MS}ms`, "--delay": `${STOP_AT[reel]}ms` }}>
                            <div className="s5-strip">
                                {/* Chooses between two things already drawn. Nothing here is random, so a
                                    re-render cannot change what is on the reels. */}
                                {(grid && landed > reel
                                    ? grid[reel]
                                    : spinning || result
                                        ? [...filler[reel], ...(grid?.[reel] || idle[reel])]
                                        : idle[reel]
                                ).map((sym, i) => (
                                    // EVERY CELL CARRIES ITS SYMBOL'S COLOUR. The wash behind the symbol is
                                    // the same hue the symbol was drawn in — one map, see SYMBOL_LOOK — so a
                                    // violet glow means a wild before you have focused on the picture. The
                                    // wild and the scatter get a stronger one than the paying symbols,
                                    // because those two are the ones you are actually hunting for.
                                    <span className={`s5-cell is-${symbolRole(sym)}`} key={i}
                                        style={{ "--tone": symbolTone(sym) }}>
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
            </div>

            {/* ── WHAT JUST HAPPENED ──────────────────────────────────────────────────────────────────── */}
            <div className="s5-say">
                {phase === "spin" ? <span className="s5-dim">…</span>
                    : lit ? <span><b>{lit.count}</b> {lit.symbol} — <b>{lit.chips.toLocaleString()}</b> chips</span>
                    : result?.wonChips ? <span className="s5-won"><b>{counted.toLocaleString()}</b> chips</span>
                    : result ? <span className="s5-dim">No line this time.</span>
                    : <span className="s5-dim">Twenty lines. Pick your deal and pull.</span>}
            </div>

            {/* ── THE DEAL CHOOSER IS GONE ────────────────────────────────────────────────────────────
                Three buttons offering twenty spins at 2x, ten at 4x or seven with sticky wilds. Luke: "remove
                the spins buttons, its too complicated." He is right about the placement even though the
                mechanic is sound: it was a question about a bonus round that arrives once in ninety-three
                spins, asked permanently, on the main screen, above the button you actually came to press.
                Ninety-two times out of ninety-three it was three buttons that did nothing.

                The round still runs — it takes the middle deal, ten spins at four times, which is the one
                that was selected by default anyway. The choice is worth having back one day, but INSIDE the
                round it belongs to, at the moment it triggers, where it is a moment rather than a setting. */}

            {/* ── THE FREE SPINS ──────────────────────────────────────────────────────────────────────── */}
            {phase === "free" && result?.free ? (
                <div className="s5-feature">
                    <h4>The moon is up — {result.free.label}</h4>
                    <p>{result.free.spins.length} spins ran. <b>{Number(result.free.chips || 0).toLocaleString()}</b> chips.</p>
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

            {/* ── THE CONTROL PANEL ───────────────────────────────────────────────────────────────────
                Luke: "proffesionalize the wager buttons and spin button."

                They were four fat yellow rectangles and a fifth fatter one, which is a form. Every real
                cabinet has the same two-part panel instead, and it is the same on a machine in a casino as it
                is in a video slot on a phone:

                  A READOUT — balance, bet, and what the last spin paid — in one strip of small caps and
                  tabular figures, because these are numbers you glance at rather than read.

                  A BET STEPPER AND ONE BIG BUTTON. A stepper is one control instead of four, it scales to any
                  number of stakes without growing, and it puts the amount itself on screen as a value rather
                  than as the selected one of a row. The spin button is then the only large thing in the
                  panel, which is exactly the hierarchy — there is one thing you press over and over. */}
            <div className="s5-readout">
                <span><i>Balance</i><b>{Number(gold || 0).toLocaleString()}</b></span>
                <span><i>Bet</i><b>{bet.toLocaleString()}</b></span>
                {/* CHIPS, not "win". What the last spin paid is already announced above the panel and then
                    gone; the number worth a permanent slot is the pile you are building, because that is the
                    one you are playing FOR and the one the counter charges against. */}
                <span className="s5-ro-chips"><i>Chips</i><b>{Number(chips || 0).toLocaleString()}</b></span>
            </div>

            <div className="s5-panel">
                <div className="s5-stepper">
                    <button type="button" aria-label="Lower the bet" disabled={locked || betIndex <= 0}
                        onClick={() => step(-1)}>−</button>
                    <span><i>Bet</i><b>{bet.toLocaleString()}</b></span>
                    <button type="button" aria-label="Raise the bet" disabled={locked || betIndex >= stakes.length - 1}
                        onClick={() => step(1)}>+</button>
                </div>
                <button type="button" className="s5-spin" onClick={pull} disabled={locked}>
                    {spinning ? <span className="s5-spin-wait" aria-hidden="true" /> : "SPIN"}
                </button>
            </div>
        </div>
    );
}
