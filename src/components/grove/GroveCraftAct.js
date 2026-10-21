"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    HEAT_MS, HEAT_TARGET, heatScore, STRIKES, STRIKE_MS, STRIKE_HIT, STRIKE_PERFECT,
    strikeGrade, actScore, boardFor, boardOdds, PEG_ROWS,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS } from "@/lib/marketplace/grove-forge.js";

// ── THE ACT ──────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Let's make it fun." Then: "3 interactive steps, thematically fitting, one is timing based, one is tap
// frequency based. And one is just rng, la plinko ball hitting pegs on itd way down. With varying buckets."
//
//   HEAT     tap the bellows, the coals come up
//   STRIKE   three hammer blows into a moving window
//   SET      the piece falls through the pegs into a band
//
// The maths is all in grove-craft-act.js, which the server reads too. This file is the hands.
//
// ── ⚠️ THE THIRD BEAT IS NOT PLAYED LOCALLY ─────────────────────────────────────────────────────────────────
// The first two beats are skill and happen here. The fall does not: pressing through the strike POSTS the
// craft, and the server answers with the landing it chose and a rattle that provably ends on it. The ball
// then drops down a path it was handed.
//
// That ordering is the whole integrity of the screen. The alternative — bounce a ball locally and tell the
// server where it stopped — is a client deciding its own loot, which this game does not do anywhere (see
// grove-roll.js, where the scene plays the whole fight and the server still re-rolls every drop). It also
// means the wait for the request happens UNDER the ball release, where it reads as suspense rather than as
// a spinner.

const BEAT = { heat: 0, strike: 1, set: 2 };

export default function GroveCraftAct({ recipe, level, temper, onCommit, onClose }) {
    const [beat, setBeat] = useState(BEAT.heat);

    // ── BEAT 1: THE HEAT ────────────────────────────────────────────────────────────────────────────
    const [taps, setTaps] = useState(0);
    const [heatLeft, setHeatLeft] = useState(HEAT_MS);
    const heat = heatScore(taps);

    // ── BEAT 2: THE STRIKE ──────────────────────────────────────────────────────────────────────────
    const [marker, setMarker] = useState(0);          // -1..1 across the bar
    const [hits, setHits] = useState([]);             // one grade per strike taken
    const [flash, setFlash] = useState(null);         // the word, briefly, after each blow

    // ── BEAT 3: THE SET ─────────────────────────────────────────────────────────────────────────────
    const [result, setResult] = useState(null);       // the server answer, once it lands
    const [fallRow, setFallRow] = useState(-1);       // which peg row the ball is on, -1 before release
    const [settled, setSettled] = useState(false);

    const raf = useRef(0);
    const started = useRef(0);
    const posted = useRef(false);

    // ⚠️ THE BOARD IS BUILT FROM WHAT HAS BEEN PLAYED SO FAR, and re-built as it is played. That is the
    // point of widening rather than aiming: the player watches the gold slivers grow while they work, so
    // the reward for a good heat is on screen BEFORE the ball is released rather than inferred after it.
    const liveAct = useMemo(() => ({ heat, strikes: hits.map((h) => h.score) }), [heat, hits]);
    const spans = useMemo(() => boardFor(level, { temper, act: liveAct }), [level, temper, liveAct]);
    const odds = useMemo(() => boardOdds(spans), [spans]);
    const score = actScore(liveAct);

    // ── THE HEAT CLOCK ──────────────────────────────────────────────────────────────────────────────
    // ⚠️ rAF, NOT setInterval, and the elapsed time is read from the CLOCK rather than counted in ticks.
    // A dropped frame under a backgrounded tab would otherwise leave the bellows running, and the first
    // frame's timestamp can predate the start — see [[negative-dt-first-frame]], which put every body in
    // the Grove through the floor for a day. Clamped at zero here for the same reason.
    useEffect(() => {
        if (beat !== BEAT.heat) return undefined;
        started.current = performance.now();
        const tick = () => {
            const gone = Math.max(0, performance.now() - started.current);
            const left = Math.max(0, HEAT_MS - gone);
            setHeatLeft(left);
            if (left <= 0) { setBeat(BEAT.strike); return; }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [beat]);

    // ── THE STRIKE MARKER ───────────────────────────────────────────────────────────────────────────
    // A triangle wave across the bar. Same clock discipline as above.
    useEffect(() => {
        if (beat !== BEAT.strike) return undefined;
        const t0 = performance.now();
        const tick = () => {
            const gone = Math.max(0, performance.now() - t0);
            const phase = (gone % STRIKE_MS) / STRIKE_MS;          // 0..1
            setMarker(phase < 0.5 ? -1 + phase * 4 : 3 - phase * 4); // -1 -> 1 -> -1
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [beat]);

    // ── THE FALL ────────────────────────────────────────────────────────────────────────────────────
    // Steps the ball one peg row at a time once the server has answered. Deliberately a row at a time
    // rather than a CSS transition to the floor: the rattle is the drama, and a ball that slides smoothly
    // to its bucket has not bounced off anything.
    useEffect(() => {
        if (!result?.set?.path) return undefined;
        let row = 0;
        setFallRow(0);
        const id = setInterval(() => {
            row += 1;
            if (row >= result.set.path.length) {
                clearInterval(id);
                setFallRow(result.set.path.length - 1);
                // A breath on the floor before the card, or the landing is over before it is read.
                setTimeout(() => setSettled(true), 520);
                return;
            }
            setFallRow(row);
        }, 115);
        return () => clearInterval(id);
    }, [result]);

    // ── COMMITTING ──────────────────────────────────────────────────────────────────────────────────
    // ⚠️ ONCE, EVER. The strike beat can finish by its own count and by the player tapping the last blow
    // in the same frame; without the ref the craft posts twice and the parts leave the bag twice.
    const commit = useCallback(async (finalHits) => {
        if (posted.current) return;
        posted.current = true;
        const act = { heat, strikes: finalHits.map((h) => h.score) };
        const d = await onCommit(act);
        if (!d?.ok) { onClose(d); return; }
        setResult(d);
    }, [heat, onCommit, onClose]);

    const tapHeat = useCallback(() => {
        if (beat !== BEAT.heat) return;
        setTaps((n) => n + 1);
    }, [beat]);

    // ⚠️ THE SIDE EFFECTS HAPPEN OUTSIDE THE UPDATER, AND THE FIRST VERSION DID NOT.
    // Advancing the beat and posting the craft were done INSIDE setHits(prev => ...), which React runs
    // during render — so the craft POST, and the setBusy it fires on GroveBench, ran mid-render of a
    // different component. React said so plainly ("Cannot update a component while rendering a different
    // component") and the screen still worked, which is the dangerous part: nothing was visibly wrong,
    // and only reading the browser console caught it. A state updater has to be pure.
    //
    // Reading `hits` directly is safe here because a strike is a discrete tap, not something that can
    // fire twice in a frame — and `posted` guards the commit regardless.
    const strike = useCallback(() => {
        if (beat !== BEAT.strike || hits.length >= STRIKES) return;
        const grade = strikeGrade(marker);
        const next = [...hits, grade];
        setFlash({ ...grade, at: marker });
        setHits(next);
        if (next.length >= STRIKES) { setBeat(BEAT.set); commit(next); }
        setTimeout(() => setFlash(null), 420);
    }, [beat, hits, marker, commit]);

    // Space and Enter play it too — the whole act is one button pressed repeatedly, and a keyboard is a
    // perfectly good thumb.
    useEffect(() => {
        const key = (e) => {
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            if (beat === BEAT.heat) tapHeat(); else if (beat === BEAT.strike) strike();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [beat, tapHeat, strike]);

    const ballX = fallRow >= 0 && result?.set?.path ? result.set.path[fallRow] : 0.5;
    const landedBand = settled ? result?.set?.band : null;

    return (
        <div className="gv-act" role="dialog" aria-label={`Crafting ${recipe?.name || ""}`}>
            <div className="gv-act-in">
                <header className="gv-act-head">
                    <b>{recipe?.name}</b>
                    <span className="gv-act-beats">
                        {["Heat", "Strike", "Set"].map((w, i) => (
                            <i key={w} className={i === beat ? "is-now" : i < beat ? "is-done" : ""}>{w}</i>
                        ))}
                    </span>
                </header>

                {/* ── THE BOARD, VISIBLE THROUGHOUT ──────────────────────────────────────────────────
                    Not revealed at the end. The whole reason skill WIDENS buckets rather than aiming the
                    ball is so the player can watch the gold grow while they work — a reward you can see
                    coming is worth more than one explained afterwards. */}
                <div className="gv-act-board">
                    <div className="gv-act-pegs" aria-hidden="true">
                        {Array.from({ length: PEG_ROWS }, (_, r) => (
                            <span key={r} className="gv-act-pegrow">
                                {Array.from({ length: 7 + (r % 2) }, (_, c) => <i key={c} />)}
                            </span>
                        ))}
                        {fallRow >= 0 ? (
                            <span className={`gv-act-ball${settled ? " is-set" : ""}`}
                                style={{ left: `${ballX * 100}%`, top: `${((fallRow + 1) / PEG_ROWS) * 100}%` }} />
                        ) : null}
                    </div>
                    <div className="gv-act-floor">
                        {spans.filter((s) => s.to > s.from).map((s, i) => (
                            <span key={`${s.id}-${i}`} className={`gv-act-slot is-${s.id}${landedBand === s.id ? " is-hit" : ""}`}
                                style={{ width: `${(s.to - s.from) * 100}%` }} />
                        ))}
                    </div>
                    <ul className="gv-act-key">
                        {odds.filter((o) => o.share > 0.001).map((o) => (
                            <li key={o.id} className={`is-${o.id}`}>
                                <b>{Math.round(o.share * 100)}%</b>
                                <span>{o.name}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* ── BEAT 1 ─────────────────────────────────────────────────────────────────────── */}
                {beat === BEAT.heat ? (
                    <div className="gv-act-beat">
                        <p className="gv-act-say">Work the bellows</p>
                        <div className="gv-act-bar">
                            <i className="gv-act-fill is-heat" style={{ width: `${heat * 100}%` }} />
                            <em>{taps}/{HEAT_TARGET}</em>
                        </div>
                        {/* ⚠️ onPointerDown, NOT onClick, and NO setPointerCapture. A tap-frequency beat on
                            click fires once per full press-and-release and feels like treacle; capture
                            would break the mouse entirely, which is the scar in
                            [[pointer-capture-kills-desktop-clicks]]. */}
                        <button type="button" className="gv-act-hit is-bellows" onPointerDown={tapHeat}>
                            TAP
                        </button>
                        <span className="gv-act-clock" style={{ width: `${(heatLeft / HEAT_MS) * 100}%` }} />
                    </div>
                ) : null}

                {/* ── BEAT 2 ─────────────────────────────────────────────────────────────────────── */}
                {beat === BEAT.strike ? (
                    <div className="gv-act-beat">
                        <p className="gv-act-say">Strike it — {STRIKES - hits.length} left</p>
                        <div className="gv-act-anvil">
                            <span className="gv-act-zone" style={{ width: `${STRIKE_HIT * 100}%` }} />
                            <span className="gv-act-core" style={{ width: `${STRIKE_PERFECT * 100}%` }} />
                            <span className="gv-act-marker" style={{ left: `${(marker + 1) * 50}%` }} />
                            {flash ? <em className={`gv-act-flash is-${flash.id}`}>{flash.label}</em> : null}
                        </div>
                        <button type="button" className="gv-act-hit is-hammer" onPointerDown={strike}>
                            STRIKE
                        </button>
                        <ul className="gv-act-hits">
                            {Array.from({ length: STRIKES }, (_, i) => (
                                <li key={i} className={hits[i] ? `is-${hits[i].id}` : ""}>{hits[i]?.label || "—"}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* ── BEAT 3 ─────────────────────────────────────────────────────────────────────── */}
                {beat === BEAT.set ? (
                    <div className="gv-act-beat">
                        <p className="gv-act-say">{settled ? "It sets" : result ? "Let it fall" : "Quenching…"}</p>
                        {settled && result ? (
                            // ⚠️ IT WEARS THE BAND IT IS ANNOUNCING. A green success button reading "Rough"
                            // tells the player two opposite things at once, and the louder of the two is
                            // the colour.
                            <button type="button" className={`gv-act-hit is-band is-${result.set.band}`}
                                onPointerDown={() => onClose(result)}>
                                {QUALITY_BANDS.find((b) => b.id === result.set.band)?.name || "Done"}
                            </button>
                        ) : (
                            <span className="gv-act-work">the work is {Math.round(score * 100)}%</span>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
