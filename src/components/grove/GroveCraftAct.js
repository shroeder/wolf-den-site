"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    HEAT_MS, HEAT_TARGET, heatScore, STRIKES, STRIKE_MS, STRIKE_HIT, STRIKE_PERFECT,
    strikeGrade, actScore, rackFor, scatterFor, oddsForAim, PEG_ROWS, RACK_MIDDLE,
} from "@/lib/marketplace/grove-craft-act.js";
// ⚠️ THE SOUND IS THE KIT THE GROVE ALREADY HAS. grove-sfx.js synthesises every note from an oscillator —
// nothing to host, nothing to preload, nothing to 404 on one bar of signal — and every call is already
// wrapped so a blocked AudioContext is a silent craft rather than a broken screen. A new sound file for
// this would have been a download and a second way for audio to fail.
import { playHit, playPickup, playDrop, celebrateUnlock } from "@/components/grove/grove-sfx.js";
import { QUALITY_BANDS, bandTint, bandInk } from "@/lib/marketplace/grove-forge.js";
import { groveArt, toolArt } from "@/lib/marketplace/grove-catalog.js";

// ── THE ACT ──────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Let's make it fun." Then: "3 interactive steps, thematically fitting, one is timing based, one is tap
// frequency based. And one is just rng, la plinko ball hitting pegs on itd way down. With varying buckets."
// Then, on the first cut: "Looks terrible." And: "User should be able to pick where to drop the thing also."
//
//   HEAT    tap the bellows, the coals come up
//   STRIKE  three hammer blows into a sweeping window
//   AIM     choose where on the rack to throw it — the gold end is also the edge
//   SET     it falls through the pegs and lands, or misses the rack
//
// The maths is in grove-craft-act.js, which the server reads too. This file is the hands and the look.
//
// ── ⚠️ IT IS DRESSED LIKE THE REST OF THE GROVE, AND THE FIRST VERSION WAS NOT ──────────────────────────────
// That is what "looks terrible" was. Every other panel in this feature is a painted board: ui-board.webp
// under a dark wash, four brass ui-corner.webp pieces, a slab-plank.webp name board with DARK ink on pale
// wood, and the thing you are handling drawn as its own sprite. The act had none of it — a flat charcoal
// card, a candy-stripe bar that read as a progress meter, and the result announced inside what looked like
// a focused text input. Correct, and a wireframe.
//
// ⚠️ THE PIECE IS THE ITEM'S OWN SPRITE. It is already drawn — groveArt for food and parts, toolArt for a
// tool at its tier — and watching the actual poultice or the actual rod come up to heat and then fall is
// the whole difference between making a thing and moving a token.
//
// ── ⚠️ THE FALL IS NOT PLAYED LOCALLY ───────────────────────────────────────────────────────────────────────
// Releasing POSTS the craft; the server answers with where it landed and a rattle that provably ends there.
// A client bouncing its own piece and reporting where it stopped is a client deciding its own loot, which
// this game does nowhere. It also puts the request under the release, where the wait reads as suspense.

const BEAT = { heat: 0, strike: 1, aim: 2, set: 3 };
const BEAT_NAME = ["Heat", "Strike", "Aim", "Set"];
// ⚠️ A DIFFERENT WORD PER BAND. "It sets" for everything taught the player there was nothing to read.
const SET_WORD = {
    masterwork: "MASTERWORK",
    pristine: "Beautiful work",
    fine: "That will do nicely",
    sound: "Sound enough",
    rough: "Rough, but it holds",
};

export default function GroveCraftAct({ recipe, level, temper, onCommit, onClose }) {
    const [beat, setBeat] = useState(BEAT.heat);
    const [taps, setTaps] = useState(0);
    const [heatLeft, setHeatLeft] = useState(HEAT_MS);
    const [marker, setMarker] = useState(0);
    const [hits, setHits] = useState([]);
    const [flash, setFlash] = useState(null);
    const [aim, setAim] = useState(0.5);
    const [result, setResult] = useState(null);
    const [fallRow, setFallRow] = useState(-1);
    const [settled, setSettled] = useState(false);

    // ── THE JUICE ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ A ROW INDEX, NOT A LIST OF PARTICLES. The pegs the piece has just passed light up and fade; the
    // only state that needs is which row it is on, which the fall already tracks. A particle system here
    // would be a second animation loop to keep in step with the first.
    const [burst, setBurst] = useState(false);
    const [shake, setShake] = useState(false);
    const raf = useRef(0);
    const posted = useRef(false);
    const rackRef = useRef(null);
    const rang = useRef(-1);

    const heat = heatScore(taps);
    const act = useMemo(() => ({ heat, strikes: hits.map((h) => h.score) }), [heat, hits]);
    const score = actScore(act);
    // ⚠️ THE RACK DOES NOT MOVE. It is cut from the crafting level and the temper and nothing else — the
    // skill beats tighten the SCATTER instead, which is what makes the far end reachable. A rack that also
    // widened would be paying for the same thumb twice.
    const rack = useMemo(() => rackFor(level, { temper }), [level, temper]);
    const scatter = scatterFor(act);
    const odds = useMemo(() => oddsForAim(rack, aim, scatter), [rack, aim, scatter]);

    const art = recipe?.kind === "tool" ? toolArt(recipe.slot, recipe.tier) : groveArt(recipe?.id);

    // ── THE HEAT CLOCK ──────────────────────────────────────────────────────────────────────────────
    // ⚠️ rAF with the elapsed time read from the CLOCK, never counted in ticks. A backgrounded tab would
    // otherwise leave the bellows running, and the first frame can predate the start — see
    // [[negative-dt-first-frame]], which dropped every body in the Grove through the floor for a day.
    useEffect(() => {
        if (beat !== BEAT.heat) return undefined;
        const t0 = performance.now();
        const tick = () => {
            const left = Math.max(0, HEAT_MS - Math.max(0, performance.now() - t0));
            setHeatLeft(left);
            if (left <= 0) { setBeat(BEAT.strike); return; }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [beat]);

    useEffect(() => {
        if (beat !== BEAT.strike) return undefined;
        const t0 = performance.now();
        const tick = () => {
            const phase = (Math.max(0, performance.now() - t0) % STRIKE_MS) / STRIKE_MS;
            setMarker(phase < 0.5 ? -1 + phase * 4 : 3 - phase * 4);
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [beat]);

    // ── THE FALL ────────────────────────────────────────────────────────────────────────────────────
    // Stepped a peg row at a time rather than transitioned to the floor: the rattle is the drama, and a
    // piece that slides smoothly into its bucket has not bounced off anything.
    useEffect(() => {
        if (!result?.set?.path) return undefined;
        let row = 0;
        setFallRow(0);
        const id = setInterval(() => {
            row += 1;
            if (row >= result.set.path.length) {
                clearInterval(id);
                setFallRow(result.set.path.length - 1);
                // ── THE MOMENT ──────────────────────────────────────────────────────────────────
                // ⚠️ SCALED TO THE RESULT. A Rough gets a thud and nothing else; the top two bands get
                // the burst, the shake and the full unlock chime. A celebration that fires identically
                // for every outcome teaches the player to stop reading it.
                const band = result.set.band;
                const big = band === "masterwork" || band === "pristine";
                setBurst(true);
                if (big) { setShake(true); setTimeout(() => setShake(false), 480); }
                if (band === "masterwork") celebrateUnlock();
                else playPickup(big);
                setTimeout(() => setSettled(true), 520);
                return;
            }
            // A tick off every peg on the way down, rising as it falls — the rattle you can hear.
            if (rang.current !== row) { rang.current = row; playDrop(); }
            setFallRow(row);
        }, 110);
        return () => clearInterval(id);
    }, [result]);

    // ⚠️ POSTED ONCE, EVER. Release can fire from a tap and from a pointer-up in the same frame.
    const release = useCallback(async () => {
        if (posted.current) return;
        posted.current = true;
        setBeat(BEAT.set);
        const d = await onCommit(act, aim);
        if (!d?.ok) { onClose(d); return; }
        setResult(d);
    }, [act, aim, onCommit, onClose]);

    const tapHeat = useCallback(() => {
        if (beat !== BEAT.heat) return;
        // The pitch climbs with the bar, so the bellows sound like they are working.
        setTaps((n) => { playHit(Math.min(7, Math.floor((n / HEAT_TARGET) * 8))); return n + 1; });
    }, [beat]);

    // ⚠️ THE SIDE EFFECTS SIT OUTSIDE THE UPDATER. Advancing the beat from inside setHits(prev => ...) ran
    // a POST during render and React said so; the screen worked perfectly and only the browser console
    // ever mentioned it. A state updater has to be pure.
    const strike = useCallback(() => {
        if (beat !== BEAT.strike || hits.length >= STRIKES) return;
        const grade = strikeGrade(marker);
        const next = [...hits, grade];
        playHit(hits.length * 3, grade.id === "perfect");
        setFlash({ ...grade, at: marker });
        setHits(next);
        if (next.length >= STRIKES) setBeat(BEAT.aim);
        setTimeout(() => setFlash(null), 420);
    }, [beat, hits, marker]);

    // ── AIMING ──────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ NO setPointerCapture. It is the obvious way to track a drag and it breaks MOUSE clicks outright —
    // see [[pointer-capture-kills-desktop-clicks]]. Listening on the rack element and reading clientX
    // against its own rect works for a thumb and a mouse alike.
    const aimAt = useCallback((clientX) => {
        const box = rackRef.current?.getBoundingClientRect();
        if (!box || !box.width) return;
        setAim(Math.max(0, Math.min(1, (clientX - box.left) / box.width)));
    }, []);
    const dragging = useRef(false);
    const onDown = (e) => { if (beat !== BEAT.aim) return; dragging.current = true; aimAt(e.clientX); };
    const onMove = (e) => { if (beat === BEAT.aim && dragging.current) aimAt(e.clientX); };
    const onUp = () => { dragging.current = false; };

    useEffect(() => {
        const key = (e) => {
            if (beat === BEAT.aim) {
                if (e.key === "ArrowLeft") { e.preventDefault(); setAim((a) => Math.max(0, a - 0.02)); }
                if (e.key === "ArrowRight") { e.preventDefault(); setAim((a) => Math.min(1, a + 0.02)); }
                if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(); }
                return;
            }
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            if (beat === BEAT.heat) tapHeat(); else if (beat === BEAT.strike) strike();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [beat, tapHeat, strike, release]);

    const pieceX = fallRow >= 0 && result?.set?.path ? result.set.path[fallRow] : aim;
    const landedBand = settled ? result?.set?.band : null;
    const say = beat === BEAT.heat ? "Work the bellows"
        : beat === BEAT.strike ? `Strike it — ${STRIKES - hits.length} left`
        : beat === BEAT.aim ? "Pick your spot"
        : settled ? SET_WORD[result?.set?.band] || "It sets"
        : result ? "Let it fall" : "Quenching…";

    return (
        <div className="gv-act" role="dialog" aria-label={`Crafting ${recipe?.name || ""}`}>
            <div className={`gv-act-in${shake ? " is-shook" : ""}`}>
                {/* THE NAME BOARD — the same painted plank every other panel in the Grove wears. */}
                <h4 className="gv-act-plank">
                    {art ? <img className="gv-act-ico" src={art} alt="" width={34} height={34} /> : null}
                    {recipe?.name}
                    <i>{BEAT_NAME[beat]}</i>
                </h4>

                <div className="gv-act-beats" aria-hidden="true">
                    {BEAT_NAME.map((w, i) => (
                        <span key={w} className={i === beat ? "is-now" : i < beat ? "is-done" : ""} />
                    ))}
                </div>

                {/* ── THE RACK ───────────────────────────────────────────────────────────────────────
                    Worst on the left, best on the right, and the right-hand end IS the edge: overshoot
                    and the piece goes on the floor. The buckets have walls and a lip so they read as
                    things a piece can land IN, which the flat stripe did not. */}
                <div className="gv-act-rack" ref={rackRef}
                    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
                    <div className="gv-act-pegs" aria-hidden="true">
                        {/* ⚠️ THE ROW THE PIECE IS ON LIGHTS UP. Nine static rows of studs was a void with
                            texture; lighting the row it just struck is what makes the fall read as the
                            piece hitting things rather than sliding past them. */}
                        {Array.from({ length: PEG_ROWS }, (_, r) => (
                            <span key={r} className={`gv-act-pegrow${fallRow === r ? " is-struck" : ""}`}>
                                {Array.from({ length: 8 + (r % 2) }, (_, c) => <i key={c} />)}
                            </span>
                        ))}
                        {/* The piece: its own sprite, glowing hot once it has been worked. */}
                        <span className={`gv-act-piece${beat >= BEAT.aim ? " is-hot" : ""}${settled ? " is-set" : ""}`}
                            style={{
                                left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                top: fallRow >= 0 ? `${((fallRow + 1) / PEG_ROWS) * 100}%` : "0%",
                                opacity: beat >= BEAT.aim ? 1 : 0.3,
                            }}>
                            {art ? <img src={art} alt="" width={32} height={32} /> : null}
                        </span>
                        {/* The landing burst — twelve sparks thrown from where it stopped. */}
                        {burst ? (
                            <span className={`gv-act-burst is-${result?.set?.band}`}
                                style={{ left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                         "--band": bandTint(result?.set?.band) }}>
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
                                    {/* ⚠️ THE LABEL ONLY FITS IN A WIDE BUCKET. Printing it in every slot put
                                        "x1.60x1.90x1.60" on top of itself in the narrow middle three — three
                                        numbers overlapping into mush in exactly the place the eye goes
                                        first. A slot too thin to read is left to its colour. */}
                                    {s.id !== "masterwork" && w > 0.085
                                        ? <b>×{s.mult.toFixed(2)}</b>
                                        : null}
                                </span>
                            );
                        })}
                    </div>

                    {/* ── THE JACKPOT, FLAGGED ───────────────────────────────────────────────────────
                        ⚠️ THREE PERCENT OF A BAR IS NOT A PRIZE, IT IS A SEAM. Coloured prismatic and left
                        at that, the best thing on the rack was a sliver between two amber buckets and read
                        as a rendering artefact. It needs a post through the board, a crown on top and the
                        multiplier written where there is room for it — the whole beat is aimed at this and
                        the player has to be able to SEE what they are aiming at. */}
                    <span className="gv-act-jack" style={{ left: `${RACK_MIDDLE * 100}%` }} aria-hidden="true">
                        <b>×{(QUALITY_BANDS[0].mult).toFixed(2)}</b>
                    </span>

                    {beat === BEAT.aim ? (
                        <span className="gv-act-aim" style={{ left: `${aim * 100}%` }} aria-hidden="true" />
                    ) : null}
                </div>

                {/* THE ODDS FOR THIS AIM — not the widths. The chance changed the moment the player got to
                    choose where to throw, and a screen still quoting widths would be quoting a game nobody
                    is playing. */}
                <ul className="gv-act-odds">
                    {odds.bands.filter((o) => o.share > 0.004).map((o) => (
                        <li key={o.id} className={`is-${o.id}`} style={{ "--band": bandTint(o.id) }}>
                            <b>{Math.round(o.share * 100)}%</b>
                            <span>{o.name}</span>
                        </li>
                    ))}
                </ul>

                <p className="gv-act-say">{say}</p>

                {beat === BEAT.heat ? (
                    <>
                        <div className="gv-act-bar">
                            <i className="gv-act-fill" style={{ width: `${heat * 100}%` }} />
                            <em>{taps}/{HEAT_TARGET}</em>
                        </div>
                        {/* onPointerDown, not onClick: a tap-frequency beat on click fires once per full
                            press-and-release and feels like treacle. */}
                        <button type="button" className="gv-act-hit is-bellows" onPointerDown={tapHeat}>TAP</button>
                        <span className="gv-act-clock"><i style={{ width: `${(heatLeft / HEAT_MS) * 100}%` }} /></span>
                    </>
                ) : null}

                {beat === BEAT.strike ? (
                    <>
                        <div className="gv-act-anvil">
                            <span className="gv-act-zone" style={{ width: `${STRIKE_HIT * 100}%` }} />
                            <span className="gv-act-core" style={{ width: `${STRIKE_PERFECT * 100}%` }} />
                            <span className="gv-act-marker" style={{ left: `${(marker + 1) * 50}%` }} />
                            {flash ? <em className={`gv-act-flash is-${flash.id}`}>{flash.label}</em> : null}
                        </div>
                        <button type="button" className="gv-act-hit is-hammer" onPointerDown={strike}>STRIKE</button>
                        <ul className="gv-act-hits">
                            {Array.from({ length: STRIKES }, (_, i) => (
                                <li key={i} className={hits[i] ? `is-${hits[i].id}` : ""}>{hits[i]?.label || "—"}</li>
                            ))}
                        </ul>
                    </>
                ) : null}

                {beat === BEAT.aim ? (
                    <>
                        <p className="gv-act-hint">
                            Drag to choose where it drops. The middle is worth the most and is the
                            hardest to hold &mdash; a cleaner heat and better strikes keep it from
                            straying.
                        </p>
                        <button type="button" className="gv-act-hit is-release" onPointerDown={release}>LET IT GO</button>
                    </>
                ) : null}

                {beat === BEAT.set ? (
                    settled && result ? (
                        <button type="button"
                            className={`gv-act-hit is-band is-${result.set.band}`}
                            style={{ "--band": bandTint(result.set.band), "--band-ink": bandInk(result.set.band) }}
                            onPointerDown={() => onClose(result)}>
                            {QUALITY_BANDS.find((b) => b.id === result.set.band)?.name || "Done"}
                        </button>
                    ) : <span className="gv-act-work">the work is {Math.round(score * 100)}%</span>
                ) : null}
                <span className="gv-act-trim" aria-hidden="true" />
            </div>
        </div>
    );
}
