"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";
import { slot5, symbolTone, symbolRole, isMult, multValue } from "@/lib/marketplace/casino-slot5.js";

// ── COLOSSAL REELS ───────────────────────────────────────────────────────────────────────────────────────────
// Luke, with a Lil' Red cabinet on screen: "there's a regular reel on the left and a huge reel on the right,
// and wilds come in big blocks. If you get a stacking wild in a column on the small screen it transfers over to
// the big screen. There's a bonus you get by getting three scatters between both screens... and the cool thing
// about the bonus is when you get even ONE wild in a column on the small screen it grows to fit the whole
// screen on the big one. Also the final column is different during the bonus — normal pay symbols, but
// stacking multipliers."
//
// TWO BOARDS, ONE PRESS. The whole feeling of this cabinet is that the small board is a lever on the big one:
// you are not watching 5x3 and 5x12 land, you are watching the small one to find out what the big one becomes.
// So the transfer is the centrepiece of the animation — the main column flashes, and the colossal column FALLS
// wild from the top, which is the one beat that says the two boards are the same machine.
//
// STACKED ABOVE RATHER THAN BESIDE. The reference is a landscape cabinet with room for both sets side by side;
// this opens on a phone. Side by side gives each set 190px, which is 38px cells and a 5x3 board floating in a
// column of dead space next to a 456px tower. Above and below, both get the full width and the transfer runs
// DOWN, which is the direction it already reads as.
const ROWS = 3;
const REELS = 5;

// Per-reel release, the same left-to-right shape the other cabinets use, and then the colossal set behind it —
// the big board lands after the small one on purpose, because the small one decides what it is going to be.
const MAIN_STOP = 190;
const COL_STOP = 230;
const SETTLE = 260;
const SEND_MS = 620;      // a wild column falling from the small board into the big one
const LINE_MS = 620;      // one winning line lit
const BONUS_MS = 2400;

export default function ColossalReels({ machineId, art, bet, data, onDone, playing, gold, chips }) {
    const m = slot5(machineId);
    const rows = data?.rows || 12;

    const [landed, setLanded] = useState(0);         // main reels stopped
    const [colLanded, setColLanded] = useState(0);   // colossal reels stopped
    const [sending, setSending] = useState([]);      // reels mid-transfer
    const [sent, setSent] = useState([]);            // reels whose transfer has landed
    const [lit, setLit] = useState(null);            // the win currently drawn
    const [won, setWon] = useState(0);
    const [free, setFree] = useState(null);          // { at, of } while the bonus runs
    const [shout, setShout] = useState(null);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));

    // The board on screen right now: the base spin, or the bonus spin being played.
    const spin = free ? data?.free?.spins?.[free.at] : data;
    const main = spin?.main;
    const col = spin?.col;
    // At rest the machine draws its own board (see `idle`), and that board has a giant standing in it — so
    // it needs a giants list of its own or the figure is tiled twelve times instead of drawn once.
    const giants = spin?.giants || (data ? [] : [{ reel: 3, row: 0, len: 12, sym: "dire" }]);

    // ── ONE SPIN, PLAYED ─────────────────────────────────────────────────────────────────────────────────
    const playOne = useCallback(async (sp, isFree) => {
        setLanded(0); setColLanded(0); setSending([]); setSent([]); setLit(null);
        for (let r = 0; r < REELS; r += 1) { await wait(MAIN_STOP); setLanded(r + 1); Cas.reelStop(r, 0.4); }
        for (let r = 0; r < REELS; r += 1) { await wait(COL_STOP); setColLanded(r + 1); Cas.reelStop(r, 0.6); }
        await wait(SETTLE);

        // ── THE TRANSFER ─────────────────────────────────────────────────────────────────────────────────
        // The one thing that crosses between the boards, and the reason to look at the small one at all. It
        // gets its own beat with nothing else moving, because a column of the big board turning wild while
        // lines are being drawn over it would be the best thing on the machine happening in the background.
        if (sp.sent?.length) {
            setSending(sp.sent);
            Cas.anticipate(SEND_MS);
            Haptic.crit();
            await wait(SEND_MS);
            setSent(sp.sent);
            setSending([]);
            Cas.jackpot();
            await wait(240);
        }

        // ── EVERY WINNING LINE, AT ONCE ──────────────────────────────────────────────────────────────────
        // Luke: "can we just show all the paying paylines once we win? All at once."
        //
        // Right, and cycling them was actively hurting the machine twice over. A hundred-line cabinet pays
        // ten or twenty lines on an ordinary spin, and lighting them one at a time at 620ms meant a spin
        // took seven seconds to finish telling you about itself — so the reels sat still while you waited,
        // which is the opposite of what a busy machine should feel like. And it made a big win look like a
        // long win rather than a BIG one: twelve small flashes in a row read as twelve small wins.
        //
        // All together, the board lights up at once and you see the shape of what you got. Ten lines
        // crossing the glass is the picture of a good spin; one line at a time is a queue.
        const wins = [...(sp.mainWins || []).map((w) => ({ ...w, set: "main" })),
            ...(sp.colWins || []).map((w) => ({ ...w, set: "col" }))];
        if (wins.length) {
            setLit(wins);
            // One rattle sized to the whole spin rather than a note per line — twenty coin pings in a row
            // is a noise, and the size of the pile is the thing worth hearing.
            Cas.coins(Math.min(1, 0.3 + wins.length / 24));
            await wait(wins.length > 6 ? LINE_MS * 2.6 : LINE_MS * 1.9);
        }
        setLit(null);
        if (sp.chips) { setWon((n) => n + sp.chips); if (!isFree) Cas.coins(0.5); }
    }, []);

    // ── THE WHOLE PRESS ──────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!data || !playing) return undefined;
        let dead = false;
        (async () => {
            unlock();
            setWon(0); setFree(null); setShout(null);
            await playOne(data, false);
            if (dead) return;

            // ── THREE MOONS BETWEEN THE TWO BOARDS ───────────────────────────────────────────────────
            // How many spins it bought was decided by how many landed, so the shout says the number — a
            // fourth moon on a board that already has three is the best second on this machine and it
            // should be told to you as such.
            if (data.free) {
                setShout({ scatters: data.free.scatters, spins: data.free.base, label: data.free.label });
                Cas.signature();
                Haptic.crit();
                await wait(BONUS_MS);
                if (dead) return;
                setShout(null);
                Cas.music("free");
                for (let i = 0; i < data.free.spins.length; i += 1) {
                    if (dead) return;
                    setFree({ at: i, of: data.free.spins.length });
                    await playOne(data.free.spins[i], true);
                }
                Cas.music(null);
                setFree(null);
            }
            if (!dead) onDone?.();
        })();
        return () => { dead = true; Cas.music(null); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, playing]);

    const cellArt = (sym) => art?.[machineId]?.[sym] || `/images/casino/reels/${machineId}-${sym}.webp`;

    // ── A REEL THAT IS STILL RUNNING HAS SOMETHING ON IT ─────────────────────────────────────────────────
    // Luke: "the reels need to look like they're actually spinning, not just mysteriously dropping in
    // place." They were an empty channel until the symbols appeared — because a reel that has not landed
    // had nothing to draw. So a running reel renders a strip of ordinary symbols and scrolls it; the strip
    // is fixed per reel rather than re-rolled every frame, which is what stops it flickering, and it is
    // deliberately NOT the landing grid, because the landing grid is the answer and this is the wait.
    // useMemo, not a ref: it is derived, deterministic and read during render, and a ref read in render is
    // the one thing the compiler will not let past.
    // ── HOW MUCH RUN-UP A REEL HAS ───────────────────────────────────────────────────────────────────────
    // Luke: "is there any way to have the real reels at all times instead of the fake one and then the
    // swap? A big part of the slot is seeing what goes by and what comes into view — the near-miss effect
    // is a lot of dopamine we are throwing away."
    //
    // He is right and it was the single worst thing about this cabinet's motion. A reel that scrolls
    // invented symbols and then SWAPS to the answer has no near miss in it at all: nothing was ever
    // approaching, so a giant sliding to a stop one row short of a line never happened — the row simply
    // appeared. The whole tension of a reel is that you can see what is coming.
    //
    // So there is no swap. Each reel is ONE strip — six lead-in symbols and then the real column, in the
    // same DOM — and stopping is the strip travelling the last of its distance. The symbols that land are
    // the symbols you watched arrive.
    // ── THE LEAD-IN MUST BE LONGER THAN THE WINDOW ───────────────────────────────────────────────────────
    // The real column lives in the same strip, so the only thing keeping it secret while the reel runs is
    // being BELOW the window. A six-cell lead on a twelve-row board put eight real symbols on screen mid
    // spin — the answer, printed early — which is why the first cut had to blank them, and blanking them is
    // what left the reels empty while they turned.
    //
    // Window plus eight: the reel spins inside the first few cells of the lead, and stopping travels the
    // whole remaining lead so the real column rises through it. Nothing is hidden and nothing is revealed
    // early; the strip's POSITION does both jobs.
    const leadCol = rows + 8;
    const leadMain = ROWS + 8;
    const runInCol = useMemo(() => Array.from({ length: leadCol }), [leadCol]);
    const runInMain = useMemo(() => Array.from({ length: leadMain }), [leadMain]);
    const filler = useMemo(() => {
        const pool = ["bone", "doubloon", "laurel", "chest", "wolf"];
        return Array.from({ length: REELS }, (_, r) =>
            Array.from({ length: 8 }, (_, i) => pool[(i * 3 + r * 2) % pool.length]));
    }, []);

    // ── A MACHINE AT REST SHOWS ITS REELS ────────────────────────────────────────────────────────────────
    // Luke: "what's with this blurred-out preview? Just have it at rest with all the sprites."
    //
    // Before the first press there is no spin to draw, and the running strip was filling the gap — so a
    // member walking up to the cabinet met two boards of blurred smears. That is the screen advertising
    // itself as broken. A slot at rest shows a board; it is the first thing anybody sees of the machine and
    // it should look like the machine.
    //
    // Deterministic rather than random: an idle board that reshuffles on every render would be a machine
    // spinning by itself, and nothing here may look like a result that was not played for.
    const idle = useMemo(() => {
        const pool = ["bone", "doubloon", "laurel", "chest", "wolf", "keeper", "dire"];
        const at = (r, i) => pool[(r * 5 + i * 3) % pool.length];
        return {
            main: Array.from({ length: REELS }, (_, r) =>
                Array.from({ length: ROWS }, (_, i) => (at(r, i) === "keeper" || at(r, i) === "dire" ? "bone" : at(r, i)))),
            // The tall board gets one giant standing in it at rest, because the giants ARE the machine and a
            // resting board that never shows one is an advert that leaves out the product.
            col: Array.from({ length: REELS }, (_, r) => (r === 3
                ? Array.from({ length: rows }, () => "dire")
                : Array.from({ length: rows }, (_, i) => {
                    const v = at(r, i);
                    return v === "keeper" || v === "dire" ? "laurel" : v;
                }))),
        };
    }, [rows]);

    // Which board to draw for a reel: the spin's own column, or the resting board when there is no spin.
    // Never null any more — a reel that is still turning hides its result by having it below the window,
    // which is how a real reel does it and is the whole point of the strip.
    const restCol = (reel, row) => (data ? col?.[reel]?.[row] : idle.col[reel][row]);
    const restMain = (reel, row) => (data ? main?.[reel]?.[row] : idle.main[reel][row]);
    // The strip only runs during an actual press. At rest there is nothing to wait for.
    const colRunning = (reel) => Boolean(data) && colLanded <= reel;
    const mainRunning = (reel) => Boolean(data) && landed <= reel;
    const isGiantAt = (reel, row) => giants.find((g) => g.reel === reel && g.row === row);
    const insideGiant = (reel, row) => giants.some((g) => g.reel === reel && row > g.row && row < g.row + g.len);

    // The win's `cells` are flat indices (reel * rows + row) for the reels it actually paid on, which is
    // exactly the path — recovered rather than sent again, so the drawn line and the lit tiles cannot
    // disagree about which cells won.
    // Every cell on every winning line, per board. Built once per render rather than searched per cell —
    // sixty-five cells times twenty wins is a scan nobody needs to do thirteen hundred times.
    const litCells = { main: new Set(), col: new Set() };
    for (const w of (lit || [])) for (const c of w.cells) litCells[w.set]?.add(c);
    const cellLit = (set, reel, row, height) => litCells[set].has(reel * height + row);

    return (
        <div className={`col5${free ? " is-free" : ""}`}>
            {/* ── THE COLOSSAL BOARD ── twelve rows, eighty of the hundred lines, and where the giants live. */}
            <div className={`col5-col${litCells.col.size ? " is-lining" : ""}`}>
                <span className="col5-tag">{data?.label || "The Colossal Reels"}</span>
                <div className="col5-grid is-tall" style={{ "--rows": rows }}>
                    {Array.from({ length: REELS }, (_, reel) => (
                        <div key={reel} className={`col5-reel${colLanded > reel ? " is-stop" : colRunning(reel) ? " is-spin" : ""}${sent.includes(reel) ? " is-sent" : ""}`}>
                            <div className="col5-strip" style={{ "--spin": leadCol }}>
                            {/* ── THE REAL COLUMN COMES FIRST IN THE STRIP ────────────────────────────
                                Luke: "reels go down, not up — you have them going up."

                                He is right, and it was baked into the ORDER. With the lead-in written
                                ABOVE the real column, the only way to bring the real column into the
                                window was to pull the strip further up — so every reel on this cabinet
                                landed by rising, which no slot machine has ever done. Reels fall.

                                Real column first, lead-in after: the reel turns deep in the lead below
                                the window, and stopping walks the strip back toward zero, so the answer
                                DESCENDS into view. See col5Roll for the other half of it. */}
                            {Array.from({ length: rows }, (_, row) => {
                                const sym = restCol(reel, row);
                                // ── ONE PICTURE, NOT SIX ────────────────────────────────────────────
                                // A giant's run is drawn once at the height of the block. The rows it
                                // covers render nothing at all — they are the same symbol to the maths and
                                // the same drawing to the eye, which is the entire point of it.
                                if (sym && insideGiant(reel, row)) return null;
                                const g = sym ? isGiantAt(reel, row) : null;
                                if (g) {
                                    return (
                                        <span key={row} className={`col5-cell is-giant${cellLit("col", reel, row, rows) ? " is-lit" : ""}`}
                                            style={{ "--tone": symbolTone(sym, machineId), "--span": g.len }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={cellArt(sym)} alt="" draggable="false" />
                                        </span>
                                    );
                                }
                                // ── `is-giant` COMES FROM THE LIST, NEVER FROM THE ROLE ──────────────
                                // symbolRole("dire") is "giant", so building the class from the role gave
                                // EVERY cell holding a giant `is-giant` — and that class carries
                                // `grid-row: span var(--span, 4)`. Twelve of them, each defaulting to a
                                // span of four, turned a twelve-row grid into a forty-eight-row one and
                                // the board grew to three times the screen. The list is what knows where a
                                // giant actually starts; the role is only what colour it is.
                                const role = sym ? (isMult(sym) ? "mult" : symbolRole(sym, machineId)) : "blank";
                                return (
                                    <span key={row} className={`col5-cell is-${role === "giant" ? "top" : role}${cellLit("col", reel, row, rows) ? " is-lit" : ""}`}
                                        style={{ "--tone": sym && !isMult(sym) ? symbolTone(sym, machineId) : "#ffd75e" }}>
                                        {sym && isMult(sym) ? <b>&times;{multValue(sym)}</b> : sym ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={cellArt(sym)} alt="" draggable="false" />
                                        ) : null}
                                    </span>
                                );
                            })}
                                {/* ── THE LEAD-IN ─────────────────────────────────────────────────────
                                    Ordinary symbols ABOVE the real ones in the same strip. While the reel
                                    runs these cycle; when it stops, the strip travels the rest of the way
                                    and the real column comes up out of them. That is the whole point: the
                                    symbols you are about to get arrive from somewhere. */}
                                {runInCol.map((f, i) => {
                                    // A lead-in tile is a REAL tile in every way but meaning: same plate,
                                    // same rim, same colour. Drawn without them first, and the board went
                                    // visibly unstyled the moment it started turning — which is its own
                                    // kind of swap, just in the other direction.
                                    const fs = filler[reel][i % filler[reel].length];
                                    return (
                                        <span key={`f${i}`} className={`col5-cell is-lead is-${symbolRole(fs, machineId)}`}
                                            style={{ "--tone": symbolTone(fs, machineId) }} aria-hidden="true">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={cellArt(fs)} alt="" draggable="false" />
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

            </div>

            {/* The wilds falling from one board into the other — one element per travelling column. */}
            {sending.length ? (
                <div className="col5-send" aria-hidden="true">
                    {sending.map((r) => <i key={r} style={{ "--reel": r }} />)}
                </div>
            ) : null}

            {/* ── THE SMALL BOARD ── the lever. It is on top because the transfer falls downward. */}
            <div className={`col5-main${litCells.main.size ? " is-lining" : ""}`}>
                <span className="col5-tag">Main reels — a full wild column sends</span>
                <div className="col5-grid" style={{ "--rows": ROWS }}>
                    {Array.from({ length: REELS }, (_, reel) => (
                        <div key={reel} className={`col5-reel${landed > reel ? " is-stop" : mainRunning(reel) ? " is-spin" : ""}${sending.includes(reel) ? " is-sending" : ""}`}>
                            <div className="col5-strip" style={{ "--spin": leadMain }}>
                            {/* ── THE REAL COLUMN COMES FIRST IN THE STRIP ────────────────────────────
                                Luke: "reels go down, not up — you have them going up."

                                He is right, and it was baked into the ORDER. With the lead-in written
                                ABOVE the real column, the only way to bring the real column into the
                                window was to pull the strip further up — so every reel on this cabinet
                                landed by rising, which no slot machine has ever done. Reels fall.

                                Real column first, lead-in after: the reel turns deep in the lead below
                                the window, and stopping walks the strip back toward zero, so the answer
                                DESCENDS into view. See col5Roll for the other half of it. */}
                            {Array.from({ length: ROWS }, (_, row) => {
                                const sym = restMain(reel, row);
                                return (
                                    <span key={row} className={`col5-cell is-${sym ? symbolRole(sym, machineId) : "blank"}${cellLit("main", reel, row, ROWS) ? " is-lit" : ""}`}
                                        style={{ "--tone": sym ? symbolTone(sym, machineId) : "#333" }}>
                                        {sym ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={cellArt(sym)} alt="" draggable="false" />
                                        ) : null}
                                    </span>
                                );
                            })}
                                {runInMain.map((f, i) => {
                                    const fs = filler[reel][i % filler[reel].length];
                                    return (
                                        <span key={`f${i}`} className={`col5-cell is-lead is-${symbolRole(fs, machineId)}`}
                                            style={{ "--tone": symbolTone(fs, machineId) }} aria-hidden="true">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={cellArt(fs)} alt="" draggable="false" />
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                {/* ── NO DRAWN LINES ──────────────────────────────────────────────────────────────────
                    Luke: "never mind, don't show the lines — just brighten up all the tiles that hit."

                    Which is the better answer on this board and it took drawing them to see why. Twenty
                    polylines crossing a 5x12 grid is a cat's cradle: the lines overlap, they cross tiles
                    that did not win on their way to ones that did, and the thing you are actually trying to
                    read — WHICH SYMBOLS PAID — is underneath all of it. A path is the right idiom for
                    twenty lines on three rows and the wrong one for forty across twelve.

                    So the tiles carry it instead. The winners light and everything else drops back, which
                    says the same thing with no ink at all. */}
            </div>

            {/* ── NO RIBBON ────────────────────────────────────────────────────────────────────────────
                Balance and chips are in the page header now, beside the coin and chip sprites — they were
                the only permanent things on this strip and they were already half-shown up there. What is
                left is WHAT THIS PRESS PAID, which is not a readout: it is an event, it matters for about
                four seconds, and a number that spends most of its life reading 0 does not deserve a
                reserved row. It arrives over the reels and leaves.

                The free-round counter joins it, because that is the other thing that is only true
                sometimes. Between them they took a whole strip of a screen that had none to spare. */}
            {(free || won > 0) ? (
                <div className="col5-flash" role="status">
                    {free ? <span className="col5-flash-spin">Free spin {free.at + 1}/{free.of}</span> : null}
                    {free && (spin?.applied || 1) > 1
                        ? <span className="col5-flash-mult">&times;{spin.applied}</span> : null}
                    {won > 0 ? <span className="col5-flash-won"><b>{won.toLocaleString()}</b> chips</span> : null}
                </div>
            ) : null}

            {/* Three moons between the two boards, and what they bought. */}
            {shout ? (
                <div className="col5-shout" role="status">
                    <i>{shout.scatters} {m.scatter === "moon" ? "moons" : "scatters"} across both boards</i>
                    <b>{shout.spins} FREE SPINS</b>
                    <em>{shout.label}</em>
                </div>
            ) : null}
        </div>
    );
}
