"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    HEAT_MS, HEAT_TARGET, HAND_OFF_MS, heatScore, STRIKES, STRIKE_MS, STRIKE_HIT, STRIKE_PERFECT,
    strikeGrade, actScore, rackFor, scatterFor, oddsForAim, PEG_ROWS, RACK_MIDDLE,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS, bandTint, bandInk } from "@/lib/marketplace/grove-forge.js";
import { recipeArt, toolArt } from "@/lib/marketplace/grove-catalog.js";
// ⚠️ THE SOUND IS THE KIT THE GROVE ALREADY HAS. grove-sfx.js synthesises every note from an oscillator —
// nothing to host, nothing to preload, nothing to 404 on one bar of signal — and every call is already
// wrapped, so a blocked AudioContext is a silent craft rather than a broken screen.
import { playHit, playPickup, playDrop, celebrateUnlock } from "@/components/grove/grove-sfx.js";
// ⚠️ THE HAPTICS ARE THE ARENA'S, NOT A SECOND SET. Luke: "every stage should let you know how you did with
// like colorful text and vibrations and stuff." Haptic.fire already swallows the unsupported case — iOS
// Safari and every desktop are no-ops — so a pattern here is best-effort everywhere and never a thrown error.
import { Haptic } from "@/components/arena/arena-audio.js";

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
// ── ⚠️ WHERE THE WORK HAPPENS IN EACH ROOM ───────────────────────────────────────────────────────────────
// Luke: "I still think the crafting needs more work visually. Its still lacking."
//
// It was: the piece hung in the dead centre of the panel while the coals sat a third of the way across the
// painting and the anvil face sat lower still. A sprite floating in front of a picture is a sprite and a
// picture; a sprite sitting IN the coals is a forge. These are the hot spot of each backdrop as a percentage
// of the plate, measured off the art, and the piece is positioned there rather than in the middle of a box.
//
// ⚠️ THEY BELONG TO THE PAINTINGS AND MUST BE RE-MEASURED IF THE ART IS REDRAWN. There is no way for code to
// find the fire in a .webp, so this is the one place in the feature where a number is pinned to a picture.
// The stage is skipped for the rack, where the piece belongs to the plinko board instead.
const STAGE_ANCHOR = [
    { x: 25, y: 62 },   // bg-forge — the coal bed
    { x: 45, y: 58 },   // bg-anvil — the face of the anvil
    null,               // bg-rack  — the piece lives in the rack itself
];
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
    // ⚠️ THE CLOCK READS THE TAPS FROM HERE, NOT FROM THE STATE. See the heat clock below: taking `taps`
    // as a dependency is what let a player pump the bellows forever.
    const tapsRef = useRef(0);
    // ⚠️ ITS OWN COUNTER, NOT `taps`. The ember burst is keyed on this so React remounts the node and the
    // CSS animation restarts from frame zero on every single pump — re-rendering the same element just
    // lets a running animation keep running, and the fifth tap in a second would show nothing at all.
    const [pump, setPump] = useState(0);
    const [heatLeft, setHeatLeft] = useState(HEAT_MS);
    const [marker, setMarker] = useState(0);
    const [hits, setHits] = useState([]);
    const [flash, setFlash] = useState(null);
    // When the anvil starts accepting blows. Set on entering the shaping stage; see HAND_OFF_MS.
    const [armedAt, setArmedAt] = useState(0);
    const [armed, setArmed] = useState(false);
    const [aim, setAim] = useState(RACK_MIDDLE);
    const [result, setResult] = useState(null);
    const [fallRow, setFallRow] = useState(-1);
    const [settled, setSettled] = useState(false);
    const [burst, setBurst] = useState(false);
    const [shake, setShake] = useState(false);
    // ── THE COUNT-IN ────────────────────────────────────────────────────────────────────────────
    // Luke: "the tapping mini game needs to have a little like countdown before it starts to let you
    // know you need to tap super fast."
    //
    // The bellows clock used to start the instant the stage did, so the first thing a player learned
    // about the fastest beat in the game was that a second of it had already gone. 3-2-1 is the oldest
    // fix there is and the only honest one: the thing you are about to be judged on is announced before
    // the judging starts. null means the count is over and the coals are live.
    const [countIn, setCountIn] = useState(3);
    // What the stage you just finished was worth, said out loud. Cleared when the next one begins.
    const [stageSay, setStageSay] = useState(null);

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
    // ── ⚠️ recipeArt, NOT groveArt. THE ACT WAS ASKING THE WRONG FUNCTION ───────────────────────────
    // groveArt answers "what does this LOOSE ITEM look like" — a part, an emblem, a food — and returns null
    // for everything else. recipeArt answers "what does this RECIPE look like" and has known about packs,
    // vaults, plots, decorations and charms since it was written. The act asked the first one, so forging a
    // Backpack III or a Rootwood Seeking ran the whole three-stage ceremony around an EMPTY FRAME, while the
    // workbench row that launched it showed the sprite correctly two inches away.
    //
    // Found by auditing art coverage with groveArt and getting 23 false positives: the audit was asking the
    // same wrong question this line was, which is the only reason it surfaced.
    const art = recipe?.kind === "tool" ? toolArt(recipe.slot, recipe.tier) : recipeArt(recipe);

    // ── THE HEAT CLOCK ──────────────────────────────────────────────────────────────────────────────
    // ⚠️ rAF with the elapsed time read from the CLOCK, never counted in ticks. A backgrounded tab would
    // leave the bellows running, and the first frame can predate the start — see
    // [[negative-dt-first-frame]], which dropped every body in the Grove through the floor for a day.
    // The stage word says its piece and goes. ⚠️ CLEARED ON A TIMER rather than an animation event: an
    // animationend never fires if the element is not painted, and a verdict that never clears would sit
    // across the anvil for the rest of the craft. Same reason the Grove's herald does it this way.
    useEffect(() => {
        if (!stageSay) return undefined;
        const t = setTimeout(() => setStageSay(null), 1700);
        return () => clearTimeout(t);
    }, [stageSay]);

    // ⚠️ ITS OWN CLOCK, AND THE HEAT CLOCK WAITS ON IT. One tick a second, a rising blip and a pulse in the
    // hand on each, then "TAP!" — which is the only word on the screen that is an instruction rather than a
    // label. Running it inside the heat effect instead would mean the bellows were already burning down
    // while the three was on screen, which is the exact bug this exists to fix.
    useEffect(() => {
        if (stage !== STAGE.fire || countIn == null) return undefined;
        const t = setTimeout(() => {
            setCountIn((n) => {
                if (n == null) return null;
                if (n <= 1) { Haptic.fire([0, 34]); playHit(7); return null; }
                Haptic.fire([0, 12]); playHit(2 + (3 - n) * 2);
                return n - 1;
            });
        }, countIn === 3 ? 450 : 620);
        return () => clearTimeout(t);
    }, [stage, countIn]);

    // ── ⚠️ `taps` WAS A DEPENDENCY OF THIS EFFECT, AND THAT IS THE WHOLE BUG ────────────────────────
    // Luke: "the bellows, like you can just tap forever, it resets the timer, so you can literally tap to
    // infinity. And I think the intention there was for it to be a timed thing... it should never refresh
    // the timer when they tap, because that's the whole point of the tapping minigame."
    //
    // Every pump changed `taps`, React tore the effect down and re-ran it, and `t0 = performance.now()`
    // started the countdown again. So the harder you played the longer you got, and the one stage in the
    // craft with a fail state had none — the bar never emptied while a thumb was moving.
    //
    // It was a dependency for an honest reason: the `left <= 0` branch grades the round with
    // heatScore(taps) and a closure over stale state would have scored zero. The fix is the ref, not the
    // dependency — the clock must be armed exactly once per round and never hear about a tap again.
    //
    // ⚠️ DO NOT ADD `taps` BACK TO SATISFY A LINT RULE. exhaustive-deps is right about almost everything
    // and wrong about a timer; the dependency it wants is the defect.
    useEffect(() => {
        if (stage !== STAGE.fire || countIn != null) return undefined;
        tapsRef.current = 0;
        setPump(0);
        const t0 = performance.now();
        const tick = () => {
            const left = Math.max(0, HEAT_MS - Math.max(0, performance.now() - t0));
            setHeatLeft(left);
            if (left <= 0) {
                // ── HOW THE FIRE WENT, SAID OUT LOUD ────────────────────────────────────────────
                // Luke: "every stage should let you know how you did with like colorful text and
                // vibrations and stuff." The heat bar emptied and the room simply changed; whether
                // you had pumped it to temperature or half-filled it was never stated, so there was
                // nothing to do better next time. The word is graded off the same heatScore the
                // plinko scatter is, so it cannot flatter you.
                const h = heatScore(tapsRef.current);
                const g = h >= 0.99 ? { id: "perfect", word: "WHITE HOT" }
                    : h >= 0.75 ? { id: "hit", word: "HOT ENOUGH" }
                    : h >= 0.4 ? { id: "ok", word: "WARM" }
                    : { id: "miss", word: "COLD" };
                setStageSay({ ...g, sub: `${tapsRef.current} pumps`, at: "fire" });
                Haptic.fire(g.id === "perfect" ? [0, 26, 40, 26, 40, 60] : g.id === "miss" ? [0, 90] : [0, 30, 50, 20]);
                setStage(STAGE.shaping);
                setArmedAt(performance.now() + HAND_OFF_MS);
                setArmed(false);
                return;
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [stage, countIn]);

    // ── ⚠️ THE MARKER WAITS FOR THE HAND-OFF, AND SO DOES THE ANVIL ─────────────────────────────────
    // Parking the marker rather than only ignoring the tap is the half that makes it fair: a window
    // already sweeping while the game refuses input reads as a dropped tap, not as a pause. It sits
    // still at the left, the room says "ready", and then it starts -- so the first strike is aimed.
    useEffect(() => {
        if (stage !== STAGE.shaping) return undefined;
        const tick = () => {
            const now = performance.now();
            if (now < armedAt) {
                setMarker(-1);
                raf.current = requestAnimationFrame(tick);
                return;
            }
            if (!armed) setArmed(true);
            const phase = (Math.max(0, now - armedAt) % STRIKE_MS) / STRIKE_MS;
            setMarker(phase < 0.5 ? -1 + phase * 4 : 3 - phase * 4);
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [stage, armedAt, armed]);

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
        setTaps((n) => { playHit(Math.min(7, Math.floor((n / HEAT_TARGET) * 8))); tapsRef.current = n + 1; return n + 1; });
        setPump((n) => n + 1);
    }, [stage]);

    // ⚠️ THE SIDE EFFECTS SIT OUTSIDE THE UPDATER. Advancing the stage from inside setHits(prev => ...) ran
    // a POST during render and React said so; the screen worked perfectly and only the browser console ever
    // mentioned it. A state updater has to be pure.
    const strike = useCallback(() => {
        // ⚠️ THE TAP THAT ENDED THE BELLOWS MUST NOT BECOME THE FIRST HAMMER BLOW. Both halves are
        // needed: the marker is parked above so the window has not started, and this refuses the blow
        // so a thumb already travelling cannot spend one of three strikes on nothing.
        if (stage !== STAGE.shaping || hits.length >= STRIKES) return;
        if (performance.now() < armedAt) return;
        const grade = strikeGrade(marker);
        const next = [...hits, grade];
        playHit(hits.length * 3, grade.id === "perfect");
        // ⚠️ IN THE HAND, ON THE FRAME. Luke: "it just doesn't have the same pop that our other timing
        // minigames have to, where you know right away when you hit the button whether you did good or
        // bad." The flash and the sparks were already here; what was missing is the half of the feedback
        // that arrives before your eyes have moved — a perfect is a double kick, a miss is one dead thud.
        Haptic.fire(grade.id === "perfect" ? [0, 18, 30, 44]
            : grade.id === "hit" ? [0, 26] : [0, 70]);
        setFlash({ ...grade, at: marker });
        setHits(next);
        if (next.length >= STRIKES) {
            // The shaping, graded as a whole: three blows, and what they came to.
            const perfect = next.filter((h) => h.id === "perfect").length;
            const missed = next.filter((h) => h.id === "miss").length;
            const g = perfect === STRIKES ? { id: "perfect", word: "FLAWLESS" }
                : missed === STRIKES ? { id: "miss", word: "ALL MISSED" }
                : missed === 0 ? { id: "hit", word: "CLEAN" }
                : { id: "ok", word: "ROUGH SHAPING" };
            setStageSay({ ...g, at: "shaping",
                sub: next.map((h) => (h.id === "perfect" ? "●" : h.id === "hit" ? "◐" : "○")).join(" ") });
            Haptic.fire(g.id === "perfect" ? [0, 30, 40, 30, 40, 80] : g.id === "miss" ? [0, 110] : [0, 34, 50, 24]);
            setStage(STAGE.setting);
        }
        setTimeout(() => setFlash(null), 420);
    }, [stage, hits, marker, armedAt]);

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

            {/* ── THE WORK, STANDING IN THE ROOM ─────────────────────────────────────────────────
                Positioned over the SCENE at that room's hot spot, not inside the control panel —
                so the piece is in the coal bed and on the anvil face rather than hovering in front
                of them. The panel sits below it and no longer covers what you are looking at. */}
            {STAGE_ANCHOR[stage] ? (
                <div className="gv-act-work-at"
                    style={{ left: `${STAGE_ANCHOR[stage].x}%`, top: `${STAGE_ANCHOR[stage].y}%` }}>
                    {stage === STAGE.fire ? (
                        <>
                            <span className="gv-act-emberglow" style={{ opacity: 0.18 + heat * 0.82 }} aria-hidden="true" />
                            {/* ⚠️ EMBERS THAT ANSWER THE TAPPING. Eight of them, each on its own delay,
                                rising faster and brighter as the bar fills — this is what makes the
                                bellows feel connected to the fire rather than to a progress bar. */}
                            <span className="gv-act-embers" aria-hidden="true">
                                {Array.from({ length: 8 }, (_, i) => (
                                    <i key={i} style={{
                                        "--i": i,
                                        opacity: heat > i / 10 ? 1 : 0,
                                        animationDuration: `${2.4 - heat * 1.1}s`,
                                    }} />
                                ))}
                            </span>
                        </>
                    ) : null}
                    {art ? (
                        <img className={`gv-act-work-piece${flash ? ` is-struck is-${flash.id}` : ""}`}
                            src={art} alt="" width={104} height={104}
                            style={stage === STAGE.fire ? {
                                filter: `drop-shadow(0 0 ${8 + heat * 34}px rgba(255,${Math.round(165 - heat * 75)},45,${0.4 + heat * 0.6})) brightness(${1 + heat * 0.5}) saturate(${1 + heat * 0.4})`,
                            } : undefined} />
                    ) : null}
                    {flash ? <em className={`gv-act-flash is-${flash.id}`}>{flash.label}</em> : null}
                    {/* The count, over the coals, before anything is being measured. */}
                    {stage === STAGE.fire && countIn != null ? (
                        <em key={countIn} className="gv-act-count">{countIn}</em>
                    ) : null}
                    {stage === STAGE.fire && countIn == null && taps === 0 ? (
                        <em className="gv-act-count is-go">TAP!</em>
                    ) : null}
                    {/* How the stage you just left went. Keyed so a repeat grade still re-animates. */}
                    {stageSay ? (
                        <em key={`${stageSay.at}-${stageSay.word}`} className={`gv-act-stageword is-${stageSay.id}`}>
                            {stageSay.word}<i>{stageSay.sub}</i>
                        </em>
                    ) : null}
                    {/* Sparks off the anvil on every blow, in the colour the blow earned. */}
                    {stage === STAGE.shaping && flash ? (
                        <span className={`gv-act-sparks is-${flash.id}`} aria-hidden="true">
                            {Array.from({ length: 10 }, (_, i) => (
                                <i key={i} style={{ "--a": `${-20 - i * 14}deg`, "--d": `${26 + (i % 3) * 14}px` }} />
                            ))}
                        </span>
                    ) : null}
                </div>
            ) : null}

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
                        <p className="gv-act-say">Work the bellows</p>
                        <div className="gv-act-bar">
                            <i className="gv-act-fill" style={{ width: `${heat * 100}%` }} />
                            <em>{taps}/{HEAT_TARGET}</em>
                        </div>
                        {/* onPointerDown, not onClick: a tap-frequency beat on click fires once per full
                            press-and-release and feels like treacle. */}
                        {/* ── ⚠️ THE PUMP HAD NO FEEDBACK AT ALL ─────────────────────────────────────
                            Luke: "when they're tapping, like there's no feedback. There needs to be
                            visual feedback, like sparks and flames flying around and stuff."

                            ⚠️ THE COALS ALREADY GLOW AND THAT IS NOT THE SAME THING. gv-act-embers is
                            an AMBIENT loop — eight motes rising forever, faster as the bar fills — so
                            the fire reacts to your SCORE but nothing reacts to the TAP. This is the
                            per-press half: one burst thrown on each pump, keyed so it restarts every
                            time. Separate class, because overriding the ambient one would have put out
                            the coals to add sparks.

                            ⚠️ THE EMBERS CARRY THE HEAT, which is the half that is not decoration.
                            `--hot` rises 0 -> 1 with the bar, and the CSS ramps the embers from a dull
                            red through orange to white. You can see how hot the fire is without reading
                            the number, which is the whole of teach-by-showing-not-telling: the colour is
                            the score. */}
                        <button type="button" className="gv-act-hit is-bellows" onPointerDown={tapHeat}>PUMP</button>
                        {pump > 0 ? (
                            <span key={pump} className="gv-act-pumpfx" aria-hidden="true"
                                style={{ "--hot": heat.toFixed(3) }}>
                                {Array.from({ length: 9 }, (_, i) => (
                                    <i key={i} style={{
                                        "--a": `${-90 + (i - 4) * 13 + ((pump * 7 + i * 31) % 11) - 5}deg`,
                                        "--d": `${34 + ((pump * 13 + i * 17) % 26)}px`,
                                        "--t": `${(i % 3) * 40}ms`,
                                    }} />
                                ))}
                            </span>
                        ) : null}
                        <span className="gv-act-clock"><i style={{ width: `${(heatLeft / HEAT_MS) * 100}%` }} /></span>
                    </div>
                ) : null}

                {/* ── STAGE TWO: THE SHAPING ────────────────────────────────────────────────────── */}
                {stage === STAGE.shaping ? (
                    <div className="gv-act-stage">
                        <p className="gv-act-say">
                            {armed ? <>Strike it &mdash; {STRIKES - hits.length} left</> : <>Ready&hellip;</>}
                        </p>
                        <div className={`gv-act-anvil${armed ? "" : " is-waiting"}`}>
                            <span className="gv-act-zone" style={{ width: `${STRIKE_HIT * 100}%` }} />
                            <span className="gv-act-core" style={{ width: `${STRIKE_PERFECT * 100}%` }} />
                            <span className="gv-act-marker" style={{ left: `${(marker + 1) * 50}%` }} />
                        </div>
                        {/* ⚠️ IT MUST LOOK LIKE IT REFUSES. The hand-off was invisible on film: a
                            full-bright gold STRIKE sitting over a parked marker, taking taps and
                            doing nothing. A control that ignores input while looking identical to one
                            that accepts it reads as a dropped tap -- which is the bug, wearing the
                            fix's clothes. Dimmed here and lit the moment the window opens. */}
                        <button type="button" className={`gv-act-hit is-hammer${armed ? "" : " is-waiting"}`}
                            aria-disabled={!armed} onPointerDown={strike}>STRIKE</button>
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
                                {/* ── ⚠️ A BALL, NOT THE ITEM ────────────────────────────────────────
                                    Luke: "I don't want it to be the item that Plinkos. I want it to
                                    just be like a colorful ball or something, but like it has to have
                                    way more dopamine as it bounces around, and then a massive dopamine
                                    burst when it splashes at the bottom."

                                    The thing falling was the recipe's own sprite — a 32px pickaxe
                                    tumbling down a peg board, which reads as the object being dropped
                                    and damaged rather than as a game being played. A ball has no such
                                    baggage and can be as loud as it likes.

                                    --n rises 0 -> 1 as it falls and the CSS rides it: the hue travels
                                    the spectrum, the glow grows, and the trail lengthens. */}
                                <span className={`gv-act-piece${settled ? " is-set" : ""}`}
                                    style={{
                                        left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                        top: fallRow >= 0 ? `${((fallRow + 1) / PEG_ROWS) * 100}%` : "0%",
                                        "--n": fallRow >= 0 ? ((fallRow + 1) / PEG_ROWS).toFixed(3) : "0",
                                    }}>
                                    <b className="gv-act-orb" aria-hidden="true" />
                                </span>
                                {burst ? (
                                    <span className={`gv-act-burst is-${result?.set?.band}`}
                                        style={{ left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                            "--band": bandTint(result?.set?.band) }} aria-hidden="true">
                                        {/* Twelve shards over 18-45px was a polite puff. Twenty-four over
                                            three times the throw, with the band's own colour, is the
                                            "massive dopamine burst when it splashes" Luke asked for. */}
                                        {Array.from({ length: 24 }, (_, i) => (
                                            <i key={i} style={{
                                                "--a": `${i * 15 + (i % 3) * 5}deg`,
                                                "--d": `${46 + (i % 5) * 22}px`,
                                                "--t": `${(i % 4) * 26}ms`,
                                            }} />
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
                            // ── ⚠️ THE PAYOFF, AND IT USED TO BE A BUTTON WITH A WORD ON IT ─────────
                            // Luke: "here you can see like it rolled pristine, but I have no idea what
                            // that means. Like there's, this is the moment you're missing where it's a
                            // huge, should be like a huge dopamine reveal of like what all of your
                            // efforts mounted up to."
                            //
                            // Three beats of a craft -- a flurry on the bellows, three timed blows, an
                            // aimed drop -- all landed on the word "Pristine" in a yellow pill, and
                            // "Pristine" is an adjective. It never said the one number that makes it
                            // worth wanting: a band is a MULTIPLIER on the piece's stats, and x1.60 is
                            // a sentence anybody can read.
                            //
                            // So the reveal states the multiplier as the hero, names the band under it,
                            // and shows the three beats that produced it -- because the question after a
                            // good roll is "what did I do right", and after a bad one it is "what do I
                            // fix", and both answers are the same three marks.
                            <div className={`gv-act-reveal is-${result.set.band}`}
                                style={{ "--band": bandTint(result.set.band), "--band-ink": bandInk(result.set.band) }}>
                                <b className="gv-act-reveal-mult">
                                    x{(QUALITY_BANDS.find((b) => b.id === result.set.band)?.mult || 1).toFixed(2)}
                                </b>
                                <span className="gv-act-reveal-band">
                                    {QUALITY_BANDS.find((b) => b.id === result.set.band)?.name || "Done"}
                                </span>
                                <span className="gv-act-reveal-sub">to every stat on it</span>
                                <span className="gv-act-reveal-run" aria-hidden="true">
                                    <i>{taps} pumps</i>
                                    <i>{hits.map((h) => (h.id === "perfect" ? "●" : h.id === "hit" ? "◐" : "○")).join(" ")}</i>
                                    <i>{Math.round(score * 100)}% work</i>
                                </span>
                                <button type="button"
                                    className={`gv-act-hit is-band is-${result.set.band}`}
                                    style={{ "--band": bandTint(result.set.band), "--band-ink": bandInk(result.set.band) }}
                                    onPointerDown={() => onClose(result)}>
                                    Take it
                                </button>
                            </div>
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
