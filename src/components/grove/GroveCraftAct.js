"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    HEAT_MS, HEAT_TARGET, heatScore, STRIKES, STRIKE_MS, STRIKE_HIT, STRIKE_PERFECT,
    strikeGrade, actScore, rackFor, scatterFor, oddsForAim, PEG_ROWS, RACK_MIDDLE,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS, bandTint, bandInk } from "@/lib/marketplace/grove-forge.js";
import { groveArt, toolArt } from "@/lib/marketplace/grove-catalog.js";
// ⚠️ THE SOUND IS THE KIT THE GROVE ALREADY HAS. grove-sfx.js synthesises every note from an oscillator —
// nothing to host, nothing to preload, nothing to 404 on one bar of signal — and every call is already
// wrapped, so a blocked AudioContext is a silent craft rather than a broken screen.
import { playHit, playPickup, playDrop, celebrateUnlock } from "@/components/grove/grove-sfx.js";

// ── THE THREE STAGES ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "its 3 separate stages with immersive background and sprite decorations, you seem to have combined it
// all?"
//
// ⚠️ HE WAS LOOKING AT A WIDGET WITH THREE MODES. The first build was one panel with the plinko rack bolted
// to the top and the controls swapping underneath — so every beat happened in the same place, in front of the
// same furniture, and the only thing that changed was which row of buttons was lit. Three stages means three
// PLACES:
//
//   THE FIRE      bg-forge   coals, bellows, tongs. Pump it up to temperature.
//   THE SHAPING   bg-anvil   the anvil on its stump, hammers on the wall. Three blows.
//   THE SETTING   bg-rack    the cooling rack and its bins. Aim, release, watch it fall.
//
// Each is full-bleed behind its own painted backdrop with the piece you are making as the hero of the scene,
// and the move between them is a dissolve rather than a re-render.
//
// ⚠️ AND THE RACK IS NOT ON SCREEN UNTIL THE THIRD STAGE. It used to be visible throughout, and there was a
// reason for that: back when the skill beats WIDENED the buckets, the player had to watch them grow. That
// mechanic is gone — skill tightens the scatter now, which does not move the rack at all — so showing it
// early had stopped buying anything and was only crowding the first two stages. A justification that expired
// is worth deleting the thing it was justifying.
//
// ⚠️ THE FALL IS STILL NOT PLAYED LOCALLY. Releasing POSTS the craft; the server picks the landing and hands
// back a rattle that provably ends on it. A client bouncing its own piece and reporting where it stopped is a
// client deciding its own loot, which this game does nowhere.

const STAGE = { fire: 0, shaping: 1, setting: 2 };
const STAGE_NAME = ["The fire", "The shaping", "The setting"];
const STAGE_BG = ["bg-forge", "bg-anvil", "bg-rack"];
// ⚠️ A DIFFERENT WORD PER BAND. "It sets" for every outcome taught the player there was nothing to read.
const SET_WORD = {
    masterwork: "MASTERWORK",
    pristine: "Beautiful work",
    fine: "That will do nicely",
    sound: "Sound enough",
    rough: "Rough, but it holds",
};

export default function GroveCraftAct({ recipe, level, temper, onCommit, onClose }) {
    const [stage, setStage] = useState(STAGE.fire);
    const [taps, setTaps] = useState(0);
    const [heatLeft, setHeatLeft] = useState(HEAT_MS);
    const [marker, setMarker] = useState(0);
    const [hits, setHits] = useState([]);
    const [flash, setFlash] = useState(null);
    const [aim, setAim] = useState(RACK_MIDDLE);
    const [result, setResult] = useState(null);
    const [fallRow, setFallRow] = useState(-1);
    const [settled, setSettled] = useState(false);
    const [burst, setBurst] = useState(false);
    const [shake, setShake] = useState(false);

    const raf = useRef(0);
    const posted = useRef(false);
    const rackRef = useRef(null);
    const rang = useRef(-1);

    const heat = heatScore(taps);
    const act = useMemo(() => ({ heat, strikes: hits.map((h) => h.score) }), [heat, hits]);
    const score = actScore(act);
    const rack = useMemo(() => rackFor(level, { temper }), [level, temper]);
    const scatter = scatterFor(act);
    const odds = useMemo(() => oddsForAim(rack, aim, scatter), [rack, aim, scatter]);
    const art = recipe?.kind === "tool" ? toolArt(recipe.slot, recipe.tier) : groveArt(recipe?.id);

    // ── THE HEAT CLOCK ──────────────────────────────────────────────────────────────────────────────
    // ⚠️ rAF with the elapsed time read from the CLOCK, never counted in ticks. A backgrounded tab would
    // leave the bellows running, and the first frame can predate the start — see
    // [[negative-dt-first-frame]], which dropped every body in the Grove through the floor for a day.
    useEffect(() => {
        if (stage !== STAGE.fire) return undefined;
        const t0 = performance.now();
        const tick = () => {
            const left = Math.max(0, HEAT_MS - Math.max(0, performance.now() - t0));
            setHeatLeft(left);
            if (left <= 0) { setStage(STAGE.shaping); return; }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [stage]);

    useEffect(() => {
        if (stage !== STAGE.shaping) return undefined;
        const t0 = performance.now();
        const tick = () => {
            const phase = (Math.max(0, performance.now() - t0) % STRIKE_MS) / STRIKE_MS;
            setMarker(phase < 0.5 ? -1 + phase * 4 : 3 - phase * 4);
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [stage]);

    // ── THE FALL ────────────────────────────────────────────────────────────────────────────────────
    // Stepped a peg row at a time rather than transitioned to the floor: the rattle is the drama, and a
    // piece that slides smoothly into its bin has not bounced off anything.
    useEffect(() => {
        if (!result?.set?.path) return undefined;
        let row = 0;
        setFallRow(0);
        const id = setInterval(() => {
            row += 1;
            if (row >= result.set.path.length) {
                clearInterval(id);
                setFallRow(result.set.path.length - 1);
                // ⚠️ SCALED TO THE RESULT. A Rough gets a thud; the top two bands get the burst, the jolt
                // and the full chime. A celebration that fires identically for every outcome teaches the
                // player to stop reading it.
                const band = result.set.band;
                const big = band === "masterwork" || band === "pristine";
                setBurst(true);
                if (big) { setShake(true); setTimeout(() => setShake(false), 480); }
                if (band === "masterwork") celebrateUnlock(); else playPickup(big);
                setTimeout(() => setSettled(true), 520);
                return;
            }
            if (rang.current !== row) { rang.current = row; playDrop(); }
            setFallRow(row);
        }, 110);
        return () => clearInterval(id);
    }, [result]);

    // ⚠️ POSTED ONCE, EVER. Release can fire from a tap and a pointer-up in the same frame.
    const release = useCallback(async () => {
        if (posted.current) return;
        posted.current = true;
        const d = await onCommit(act, aim);
        if (!d?.ok) { onClose(d); return; }
        setResult(d);
    }, [act, aim, onCommit, onClose]);

    const tapHeat = useCallback(() => {
        if (stage !== STAGE.fire) return;
        setTaps((n) => { playHit(Math.min(7, Math.floor((n / HEAT_TARGET) * 8))); return n + 1; });
    }, [stage]);

    // ⚠️ THE SIDE EFFECTS SIT OUTSIDE THE UPDATER. Advancing the stage from inside setHits(prev => ...) ran
    // a POST during render and React said so; the screen worked perfectly and only the browser console ever
    // mentioned it. A state updater has to be pure.
    const strike = useCallback(() => {
        if (stage !== STAGE.shaping || hits.length >= STRIKES) return;
        const grade = strikeGrade(marker);
        const next = [...hits, grade];
        playHit(hits.length * 3, grade.id === "perfect");
        setFlash({ ...grade, at: marker });
        setHits(next);
        if (next.length >= STRIKES) setStage(STAGE.setting);
        setTimeout(() => setFlash(null), 420);
    }, [stage, hits, marker]);

    // ── AIMING ──────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ NO setPointerCapture. It is the obvious way to track a drag and it breaks MOUSE clicks outright —
    // see [[pointer-capture-kills-desktop-clicks]].
    const dragging = useRef(false);
    const aimAt = useCallback((clientX) => {
        const box = rackRef.current?.getBoundingClientRect();
        if (!box || !box.width) return;
        setAim(Math.max(0, Math.min(1, (clientX - box.left) / box.width)));
    }, []);
    const canAim = stage === STAGE.setting && !result;
    const onDown = (e) => { if (!canAim) return; dragging.current = true; aimAt(e.clientX); };
    const onMove = (e) => { if (canAim && dragging.current) aimAt(e.clientX); };
    const onUp = () => { dragging.current = false; };

    useEffect(() => {
        const key = (e) => {
            if (canAim) {
                if (e.key === "ArrowLeft") { e.preventDefault(); setAim((a) => Math.max(0, a - 0.02)); }
                if (e.key === "ArrowRight") { e.preventDefault(); setAim((a) => Math.min(1, a + 0.02)); }
                if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(); }
                return;
            }
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            if (stage === STAGE.fire) tapHeat(); else if (stage === STAGE.shaping) strike();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [stage, canAim, tapHeat, strike, release]);

    const pieceX = fallRow >= 0 && result?.set?.path ? result.set.path[fallRow] : aim;
    const landedBand = settled ? result?.set?.band : null;

    return (
        <div className={`gv-act${shake ? " is-shook" : ""}`}
            role="dialog" aria-label={`Crafting ${recipe?.name || ""}`}>
            {/* ⚠️ ONE LAYER PER STAGE, CROSS-FADED, rather than swapping a background-image url. Swapping
                the url makes the next scene pop in unpainted; three stacked layers let the move between
                places be a dissolve, and all three are decoded from the first frame. */}
            <div className="gv-act-scenes" aria-hidden="true">
                {STAGE_BG.map((bg, i) => (
                    <i key={bg} className={`gv-act-scene${i === stage ? " is-on" : ""}`}
                        style={{ backgroundImage: `url(/images/grove/${bg}.webp)` }} />
                ))}
            </div>

            <div className="gv-act-in">
                <h4 className="gv-act-plank">
                    {art ? <img className="gv-act-ico" src={art} alt="" width={34} height={34} /> : null}
                    {recipe?.name}
                    <i>{STAGE_NAME[stage]}</i>
                </h4>

                <div className="gv-act-beats" aria-hidden="true">
                    {STAGE_NAME.map((w, i) => (
                        <span key={w} className={i === stage ? "is-now" : i < stage ? "is-done" : ""} />
                    ))}
                </div>

                {/* ── STAGE ONE: THE FIRE ───────────────────────────────────────────────────────── */}
                {stage === STAGE.fire ? (
                    <div className="gv-act-stage">
                        {/* ⚠️ THE PIECE IS IN THE COALS AND BRIGHTENS AS THE BAR FILLS. The heat is the
                            thing you are making, not a meter standing next to it. */}
                        <div className="gv-act-hero">
                            <span className="gv-act-emberglow" style={{ opacity: 0.2 + heat * 0.8 }} />
                            {art ? (
                                <img src={art} alt="" width={104} height={104}
                                    style={{ filter: `drop-shadow(0 0 ${8 + heat * 32}px rgba(255,${Math.round(160 - heat * 70)},45,${0.45 + heat * 0.55})) brightness(${1 + heat * 0.45}) saturate(${1 + heat * 0.35})` }} />
                            ) : null}
                        </div>
                        <p className="gv-act-say">Work the bellows</p>
                        <div className="gv-act-bar">
                            <i className="gv-act-fill" style={{ width: `${heat * 100}%` }} />
                            <em>{taps}/{HEAT_TARGET}</em>
                        </div>
                        {/* onPointerDown, not onClick: a tap-frequency beat on click fires once per full
                            press-and-release and feels like treacle. */}
                        <button type="button" className="gv-act-hit is-bellows" onPointerDown={tapHeat}>PUMP</button>
                        <span className="gv-act-clock"><i style={{ width: `${(heatLeft / HEAT_MS) * 100}%` }} /></span>
                    </div>
                ) : null}

                {/* ── STAGE TWO: THE SHAPING ────────────────────────────────────────────────────── */}
                {stage === STAGE.shaping ? (
                    <div className="gv-act-stage">
                        <div className="gv-act-hero">
                            {art ? (
                                <img className={flash ? `is-struck is-${flash.id}` : ""} src={art} alt=""
                                    width={104} height={104} />
                            ) : null}
                            {flash ? <em className={`gv-act-flash is-${flash.id}`}>{flash.label}</em> : null}
                        </div>
                        <p className="gv-act-say">Strike it &mdash; {STRIKES - hits.length} left</p>
                        <div className="gv-act-anvil">
                            <span className="gv-act-zone" style={{ width: `${STRIKE_HIT * 100}%` }} />
                            <span className="gv-act-core" style={{ width: `${STRIKE_PERFECT * 100}%` }} />
                            <span className="gv-act-marker" style={{ left: `${(marker + 1) * 50}%` }} />
                        </div>
                        <button type="button" className="gv-act-hit is-hammer" onPointerDown={strike}>STRIKE</button>
                        <ul className="gv-act-hits">
                            {Array.from({ length: STRIKES }, (_, i) => (
                                <li key={i} className={hits[i] ? `is-${hits[i].id}` : ""}>{hits[i]?.label || "—"}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* ── STAGE THREE: THE SETTING ──────────────────────────────────────────────────── */}
                {stage === STAGE.setting ? (
                    <div className="gv-act-stage">
                        <div className="gv-act-rack" ref={rackRef}
                            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
                            <div className="gv-act-pegs">
                                {Array.from({ length: PEG_ROWS }, (_, r) => (
                                    <span key={r} className={`gv-act-pegrow${fallRow === r ? " is-struck" : ""}`} aria-hidden="true">
                                        {Array.from({ length: 8 + (r % 2) }, (_, c) => <i key={c} />)}
                                    </span>
                                ))}
                                <span className={`gv-act-piece${settled ? " is-set" : ""}`}
                                    style={{
                                        left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                        top: fallRow >= 0 ? `${((fallRow + 1) / PEG_ROWS) * 100}%` : "0%",
                                    }}>
                                    {art ? <img src={art} alt="" width={32} height={32} /> : null}
                                </span>
                                {burst ? (
                                    <span className={`gv-act-burst is-${result?.set?.band}`}
                                        style={{ left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                            "--band": bandTint(result?.set?.band) }} aria-hidden="true">
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <i key={i} style={{ "--a": `${i * 30}deg`, "--d": `${18 + (i % 4) * 9}px` }} />
                                        ))}
                                    </span>
                                ) : null}
                            </div>

                            <div className="gv-act-buckets">
                                {rack.map((s, i) => {
                                    const w = s.to - s.from;
                                    return (
                                        <span key={`${s.id}-${i}`}
                                            className={`gv-act-bucket is-${s.id}${landedBand === s.id && settled ? " is-hit" : ""}`}
                                            style={{ width: `${w * 100}%`, "--band": bandTint(s.id) }}>
                                            {/* A bin too thin to read is left to its colour — a label in
                                                every one put three numbers on top of each other in the
                                                narrow middle. */}
                                            {s.id !== "masterwork" && w > 0.085 ? <b>×{s.mult.toFixed(2)}</b> : null}
                                        </span>
                                    );
                                })}
                            </div>

                            <span className="gv-act-jack" style={{ left: `${RACK_MIDDLE * 100}%` }} aria-hidden="true">
                                <b>×{QUALITY_BANDS[0].mult.toFixed(2)}</b>
                            </span>
                            {canAim ? (
                                <span className="gv-act-aim" style={{ left: `${aim * 100}%` }} aria-hidden="true" />
                            ) : null}
                        </div>

                        <ul className="gv-act-odds">
                            {odds.bands.filter((o) => o.share > 0.004).map((o) => (
                                <li key={o.id} className={`is-${o.id}`} style={{ "--band": bandTint(o.id) }}>
                                    <b>{Math.round(o.share * 100)}%</b>
                                    <span>{o.name}</span>
                                </li>
                            ))}
                        </ul>

                        <p className="gv-act-say">
                            {settled ? SET_WORD[result?.set?.band] || "It sets"
                                : result ? "Let it fall" : "Pick your spot"}
                        </p>

                        {settled && result ? (
                            <button type="button"
                                className={`gv-act-hit is-band is-${result.set.band}`}
                                style={{ "--band": bandTint(result.set.band), "--band-ink": bandInk(result.set.band) }}
                                onPointerDown={() => onClose(result)}>
                                {QUALITY_BANDS.find((b) => b.id === result.set.band)?.name || "Done"}
                            </button>
                        ) : result ? (
                            <span className="gv-act-work">the work is {Math.round(score * 100)}%</span>
                        ) : (
                            <button type="button" className="gv-act-hit is-release" onPointerDown={release}>
                                LET IT GO
                            </button>
                        )}
                    </div>
                ) : null}

                <span className="gv-act-trim" aria-hidden="true" />
            </div>
        </div>
    );
}
